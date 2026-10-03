import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
// Exported by the dk_results producer; provenance in public/mock/PRODUCER_FIXTURE.md.
import producerSnapshot from '../../public/mock/snapshots/live-2026-10-03T20-48-31Z.json'
import Live from '../routes/Live'

const SNAPSHOT_PATH = 'snapshots/live-2026-10-03T20-48-31Z.json'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  cleanup()
})

async function renderLiveAgainstProducerSnapshot(sport: string, snapshot: unknown = producerSnapshot) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/latest') || url.includes('/mock/latest.json')) {
        return new Response(
          JSON.stringify({
            available_sports: ['cfb', 'golf', 'mlb'],
            generated_at: '2026-10-03T20:48:31Z',
            latest_snapshot_path: SNAPSHOT_PATH,
            manifest_today_path: 'manifest/2026-10-03.json',
            snapshot_at: '2026-10-03T20:48:31Z',
          }),
          { status: 200 },
        )
      }
      return new Response(JSON.stringify(snapshot), { status: 200 })
    }),
  )

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/live/${sport}`]}>
        <Routes>
          <Route path="/live/:sport" element={<Live />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )

  await screen.findByRole('heading', { name: new RegExp(`live: ${sport}`, 'i') })
}

type MutableContest = {
  live_metrics: Record<string, unknown>
  train_clusters: Array<Record<string, unknown>>
}

function mlbContest(snapshot: typeof producerSnapshot): MutableContest {
  return snapshot.sports.mlb.contests[0] as unknown as MutableContest
}

function panel(headingName: RegExp) {
  const heading = screen.getByRole('heading', { name: headingName })
  const container = heading.closest('.panel')
  if (!(container instanceof HTMLElement)) throw new Error(`No panel for ${headingName}`)
  return container
}

it('renders the Live route against the producer-exported v3 snapshot', async () => {
  await renderLiveAgainstProducerSnapshot('mlb')

  const contest = panel(/primary contest/i)
  expect(within(contest).getByText('MLB Single Entry $5 Double Up')).toBeInTheDocument()
  expect(within(contest).getByText(/contest key: mlb:196293731/i)).toBeInTheDocument()

  const trainRows = within(panel(/train finder/i)).getAllByRole('row')
  expect(trainRows).toHaveLength(1 + 17)

  const standings = panel(/^standings$/i)
  expect(within(standings).getByText('nycgator12')).toBeInTheDocument()
})

it('shows the Train finder update time and Train rule from the producer snapshot', async () => {
  await renderLiveAgainstProducerSnapshot('mlb')

  const trains = panel(/train finder/i)
  const updatedAt = new Date('2026-10-03T20:48:31Z').toLocaleString()
  expect(within(trains).getByText(`Updated: ${updatedAt}`)).toBeInTheDocument()
  expect(
    within(trains).getByText('Train rule: salary_remaining<=40000_and_same_points_pmr'),
  ).toBeInTheDocument()
  expect(within(trains).queryByText(/unknown/i)).not.toBeInTheDocument()
  expect(within(trains).queryByText(/cluster rule/i)).not.toBeInTheDocument()
})

it('shows Rank, Entries, Points, PMR and Lineup for each train with rounded numbers', async () => {
  await renderLiveAgainstProducerSnapshot('cfb')

  const table = within(panel(/train finder/i)).getByRole('table')
  const headers = within(table)
    .getAllByRole('columnheader')
    .map((cell) => cell.textContent)
  expect(headers).toEqual(['Rank', 'Entries', 'Points', 'PMR', 'Lineup'])

  const secondTrain = within(table).getAllByRole('row')[2]
  const cells = within(secondTrain)
    .getAllByRole('cell')
    .slice(0, 4)
    .map((cell) => cell.textContent)
  expect(cells).toEqual(['8', '3', '177.52', '119.8'])
})

it('shows each train lineup as slot chips with locked slots muted and in position', async () => {
  await renderLiveAgainstProducerSnapshot('mlb')

  const table = within(panel(/train finder/i)).getByRole('table')
  const firstTrain = within(table).getAllByRole('row')[1]
  const chips = within(within(firstTrain).getByRole('list', { name: /lineup/i })).getAllByRole('listitem')

  expect(chips.map((chip) => chip.textContent)).toEqual([
    'Locked 🔒',
    'Parker Messick',
    'Will Smith',
    'Freddie Freeman',
    'Ozzie Albies',
    'Jose Ramirez',
    'Locked 🔒',
    'Jo Adell',
    'Locked 🔒',
    'Steven Kwan',
  ])
  expect(chips[0]).toHaveClass('live-train-chip-locked')
  expect(chips[1]).not.toHaveClass('live-train-chip-locked')
  expect(within(firstTrain).queryByText(/\|/)).not.toBeInTheDocument()
})

it('shows a dash for a train whose lineup has no slots', async () => {
  const snapshot = structuredClone(producerSnapshot)
  const clusters = mlbContest(snapshot).train_clusters
  clusters[0].lineup_signature = ''
  clusters[1].lineup_signature = ' | '
  delete clusters[2].lineup_signature
  // Rank them best so they are the first three rows.
  clusters.slice(0, 3).forEach((cluster, index) => {
    cluster.rank = index + 1
  })

  await renderLiveAgainstProducerSnapshot('mlb', snapshot)

  const rows = within(within(panel(/train finder/i)).getByRole('table')).getAllByRole('row')
  for (const row of rows.slice(1, 4)) {
    const lineupCell = within(row).getAllByRole('cell')[4]
    expect(lineupCell).toHaveTextContent(/^—$/)
    expect(within(lineupCell).queryByRole('list')).not.toBeInTheDocument()
  }
  expect(rows).toHaveLength(1 + 17)
})

const FEED_ISSUE_URL = 'https://github.com/relomy/dk_results/issues/156'

function expectFeedNotProvided(container: HTMLElement) {
  expect(within(container).getByText(/feed does not provide this metric yet/i)).toBeInTheDocument()
  const link = within(container).getByRole('link', { name: /relomy\/dk_results#156/i })
  expect(link).toHaveAttribute('href', FEED_ISSUE_URL)
}

function subPanel(headingName: RegExp) {
  const container = screen.getByRole('heading', { name: headingName }).closest('.panel-subtle')
  if (!(container instanceof HTMLElement)) throw new Error(`No sub-panel for ${headingName}`)
  return container
}

type MutableCfbContest = {
  live_metrics: Record<string, unknown>
  metrics: { threat: Record<string, unknown> } & Record<string, unknown>
  vip_lineups: Array<Record<string, unknown>>
}

function cfbContest(snapshot: typeof producerSnapshot): MutableCfbContest {
  return snapshot.sports.cfb.contests[0] as unknown as MutableCfbContest
}

it('titles the top-10 panel Ownership leaders with rounded points and PMR', async () => {
  await renderLiveAgainstProducerSnapshot('cfb')

  const leaders = subPanel(/^ownership leaders$/i)
  expect(within(leaders).queryByText(/watchlist/i)).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: /watchlist/i })).not.toBeInTheDocument()
  const rows = within(within(leaders).getByRole('table')).getAllByRole('row')
  const cells = within(rows[1])
    .getAllByRole('cell')
    .map((cell) => cell.textContent)
  expect(cells).toEqual(['bruc0074', '272.07%', '231.8', '142', '113.18'])
})

it('says the feed does not provide the four metrics yet, linking dk_results#156', async () => {
  await renderLiveAgainstProducerSnapshot('mlb')

  expectFeedNotProvided(subPanel(/vip vs field leverage/i))
  expectFeedNotProvided(subPanel(/vip ownership summary/i))
  expectFeedNotProvided(subPanel(/entries not cashing/i))
  expectFeedNotProvided(subPanel(/avg salary per player remaining/i))
})

it('populates the four panels when the feed provides the metrics', async () => {
  const snapshot = structuredClone(producerSnapshot)
  const contest = cfbContest(snapshot)
  contest.vip_lineups = [{ entry_key: 'vip-1', display_name: 'Leverage VIP', slots: [] }]
  contest.live_metrics.avg_salary_per_player_remaining = 4321.6
  contest.metrics.threat.field_remaining_pct = 12.345
  contest.metrics.threat.vip_vs_field_leverage = [
    {
      entry_key: 'vip-1',
      display_name: 'Leverage VIP',
      vip_remaining_pct: 40,
      field_remaining_pct: 30.5,
      uniqueness_delta_pct: 9.5,
    },
  ]
  contest.metrics.non_cashing = { users_not_cashing: 77, avg_pmr_remaining: 12.5, top_remaining_players: [] }
  contest.metrics.ownership_summary = {
    per_vip: [{ entry_key: 'vip-1', total_ownership_pct: 55.5, ownership_in_play_pct: 20, is_partial: false }],
  }

  await renderLiveAgainstProducerSnapshot('cfb', snapshot)

  const leverage = subPanel(/vip vs field leverage/i)
  expect(within(leverage).queryByText(/feed does not provide/i)).not.toBeInTheDocument()
  expect(within(leverage).getByText('+9.5%')).toBeInTheDocument()
  expect(within(leverage).getByText('Field remaining: 12.35%')).toBeInTheDocument()
  expect(within(leverage).queryByText(/watchlist/i)).not.toBeInTheDocument()

  const summary = subPanel(/vip ownership summary/i)
  expect(within(summary).queryByText(/feed does not provide/i)).not.toBeInTheDocument()
  expect(within(summary).getByText('55.5%')).toBeInTheDocument()

  const nonCashing = panel(/non-cashing info/i)
  expect(within(nonCashing).queryByText(/feed does not provide/i)).not.toBeInTheDocument()
  expect(within(nonCashing).getByText(/entries not cashing: 77/i)).toBeInTheDocument()

  const avg = subPanel(/avg salary per player remaining/i)
  expect(within(avg).getByText('$4,322')).toBeInTheDocument()
  expect(within(avg).queryByText(/feed does not provide/i)).not.toBeInTheDocument()
})

it('omits Train finder header values the snapshot does not carry', async () => {
  const snapshot = structuredClone(producerSnapshot)
  const contest = mlbContest(snapshot)
  delete contest.live_metrics.updated_at
  for (const cluster of contest.train_clusters) delete cluster.cluster_rule

  await renderLiveAgainstProducerSnapshot('mlb', snapshot)

  const trains = panel(/train finder/i)
  expect(within(trains).queryByText(/updated:/i)).not.toBeInTheDocument()
  expect(within(trains).queryByText(/train rule:/i)).not.toBeInTheDocument()
  expect(within(trains).queryByText(/unknown/i)).not.toBeInTheDocument()
})

it('omits update times and selection reason the snapshot does not carry instead of saying unknown', async () => {
  const snapshot = structuredClone(producerSnapshot)
  cfbContest(snapshot).vip_lineups = [{ entry_key: 'vip-1', display_name: 'No Timestamp VIP', slots: [] }]
  ;(snapshot.sports.cfb.primary_contest as Record<string, unknown>).selection_reason = {}

  await renderLiveAgainstProducerSnapshot('cfb', snapshot)

  const vipCard = screen.getByText('No Timestamp VIP').closest('li')
  if (!(vipCard instanceof HTMLElement)) throw new Error('No VIP card')
  expect(within(vipCard).queryByText(/last updated/i)).not.toBeInTheDocument()

  const standings = panel(/^standings$/i)
  expect(within(standings).queryByText(/updated:/i)).not.toBeInTheDocument()

  expect(within(panel(/primary contest/i)).queryByText(/selection reason/i)).not.toBeInTheDocument()
  expect(screen.queryByText(/unknown/i)).not.toBeInTheDocument()
})

it('says Ownership leaders, not watchlist, when the panel has no entries', async () => {
  const snapshot = structuredClone(producerSnapshot)
  ;(cfbContest(snapshot) as unknown as { ownership_watchlist: { entries: unknown[] } }).ownership_watchlist.entries = []

  await renderLiveAgainstProducerSnapshot('cfb', snapshot)

  const leaders = subPanel(/^ownership leaders$/i)
  expect(within(leaders).getByText('No Ownership leaders entries available.')).toBeInTheDocument()
  expect(screen.queryByText(/watchlist/i)).not.toBeInTheDocument()
})

it('omits the Field remaining line when leverage rows exist but the field total does not', async () => {
  const snapshot = structuredClone(producerSnapshot)
  const contest = cfbContest(snapshot)
  delete contest.metrics.threat.field_remaining_pct
  contest.metrics.threat.vip_vs_field_leverage = [
    { entry_key: 'vip-1', display_name: 'Leverage VIP', vip_remaining_pct: 40, uniqueness_delta_pct: 9.5 },
  ]

  await renderLiveAgainstProducerSnapshot('cfb', snapshot)

  const leverage = subPanel(/vip vs field leverage/i)
  expect(within(leverage).getByText('+9.5%')).toBeInTheDocument()
  expect(within(leverage).queryByText(/field remaining.*:/i)).not.toBeInTheDocument()
})

it('rounds standings points to 2 decimals and PMR to 1', async () => {
  await renderLiveAgainstProducerSnapshot('mlb')

  const row = within(panel(/^standings$/i)).getByText('nycgator12').closest('tr')
  if (!(row instanceof HTMLTableRowElement)) throw new Error('No standings row')
  const cells = within(row)
    .getAllByRole('cell')
    .slice(0, 4)
    .map((cell) => cell.textContent)
  expect(cells).toEqual(['nycgator12', '1', '43.15', '56.5'])
})

function trainRanks() {
  const rows = within(within(panel(/train finder/i)).getByRole('table')).getAllByRole('row').slice(1)
  return rows.map((row) => within(row).getAllByRole('cell')[0].textContent)
}

it('lists trains best-placed first, with trains missing a rank last', async () => {
  const snapshot = structuredClone(producerSnapshot)
  delete mlbContest(snapshot).train_clusters[0].rank

  await renderLiveAgainstProducerSnapshot('mlb', snapshot)

  expect(trainRanks()).toEqual([
    '25', '49', '54', '54', '68', '68', '68', '68', '68', '88', '88', '101', '101', '101', '101', '123', '—',
  ])
})
