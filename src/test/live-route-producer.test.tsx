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
  expect(cells).toEqual(['175', '9', '102.0', '250.6'])
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

  await renderLiveAgainstProducerSnapshot('mlb', snapshot)

  const rows = within(within(panel(/train finder/i)).getByRole('table')).getAllByRole('row')
  for (const row of rows.slice(1, 4)) {
    const lineupCell = within(row).getAllByRole('cell')[4]
    expect(lineupCell).toHaveTextContent(/^—$/)
    expect(within(lineupCell).queryByRole('list')).not.toBeInTheDocument()
  }
  expect(rows).toHaveLength(1 + 17)
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
