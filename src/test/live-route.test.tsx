import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
// Exported by the dk_results producer; provenance in public/mock/PRODUCER_FIXTURE.md.
import producerSnapshot from '../../public/mock/snapshots/live-2026-10-03T20-48-31Z.json'
import Live from '../routes/Live'

// Variants of the producer fixture. cfb carries `metrics.threat`; mlb carries no `metrics` at all.
// The producer fixture has no VIP lineups, so tests that need one inject it with addVip().

const SNAPSHOT_PATH = 'snapshots/live-2026-10-03T20-48-31Z.json'
const VIP_KEY = '5067365318'
const VIP_NAME = 'cglenn91'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any

function load(): Json {
  return structuredClone(producerSnapshot)
}

function contestOf(snapshot: Json, sport = 'cfb'): Json {
  return snapshot.sports[sport].contests[0]
}

function addVip(snapshot: Json, sport = 'cfb', overrides: Json = {}): Json {
  const vip = {
    entry_key: VIP_KEY,
    display_name: VIP_NAME,
    slots: [{ slot: 'QB', player_name: 'Ashton Daniels' }],
    payout_cents: null,
    ...overrides,
  }
  contestOf(snapshot, sport).vip_lineups = [vip]
  return vip
}

function setPlayers(snapshot: Json, players: Json[], sport = 'cfb') {
  snapshot.sports[sport].players = players
}
/* eslint-enable @typescript-eslint/no-explicit-any */

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  cleanup()
})

async function renderLive(snapshot: unknown, sport = 'cfb') {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/latest') || url.includes('/mock/latest.json')) {
        return new Response(
          JSON.stringify({
            latest_snapshot_path: SNAPSHOT_PATH,
            snapshot_at: '2026-10-03T20:48:31Z',
            generated_at: '2026-10-03T20:48:31Z',
            available_sports: ['cfb', 'golf', 'mlb'],
            manifest_today_path: 'manifest/2026-10-03.json',
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

function panel(headingName: RegExp, selector = '.panel') {
  const container = screen.getByRole('heading', { name: headingName }).closest(selector)
  if (!(container instanceof HTMLElement)) throw new Error(`No panel for ${headingName}`)
  return container
}

it('resolves and renders the selected primary contest for live route', async () => {
  await renderLive(load())
  expect(screen.getByRole('heading', { name: /primary contest/i })).toBeInTheDocument()
  expect(screen.getByText(/contest key:/i)).toBeInTheDocument()
  expect(screen.getByText(/selection reason: explicit_id/i)).toBeInTheDocument()
})

it('shows explicit state when primary contest is not configured', async () => {
  const snapshot = load()
  delete snapshot.sports.cfb.primary_contest
  await renderLive(snapshot)
  expect(screen.getByText(/primary contest is not configured for this sport/i)).toBeInTheDocument()
})

it('prefers contest.is_primary before primary_contest key/id fallbacks', async () => {
  const snapshot = load()
  const primary = contestOf(snapshot)
  primary.is_primary = true
  const decoy = structuredClone(primary)
  decoy.is_primary = false
  decoy.contest_id = '1002'
  decoy.contest_key = 'cfb:1002'
  snapshot.sports.cfb.contests.push(decoy)
  snapshot.sports.cfb.primary_contest = {
    contest_id: '1002',
    contest_key: 'cfb:1002',
    selection_reason: 'conflict-for-test',
    selected_at: '2026-10-03T20:48:31Z',
  }

  await renderLive(snapshot)
  expect(screen.getByText(new RegExp(`contest id: ${primary.contest_id}`, 'i'))).toBeInTheDocument()
  expect(screen.queryByText(/contest id: 1002/i)).not.toBeInTheDocument()
})

it('renders threat metrics from the producer snapshot', async () => {
  const snapshot = load()
  contestOf(snapshot).metrics.threat.top_swing_players[0].vip_count = 2
  await renderLive(snapshot)
  const threat = panel(/threat & leverage/i)
  const swingCard = within(threat).getByText(/Ousmane Kromah/i).closest('li')
  if (!swingCard) throw new Error('Swing card not found')
  expect(within(swingCard).getByText(/VIP x2/i)).toBeInTheDocument()
})

it('renders vip_vs_field_leverage rows when the feed provides them', async () => {
  const snapshot = load()
  contestOf(snapshot).metrics.threat.vip_vs_field_leverage = [
    { display_name: 'Leverage Fixture VIP', vip_remaining_pct: 11.11, field_remaining_pct: 4.56, uniqueness_delta_pct: 6.55 },
  ]

  await renderLive(snapshot)
  const leverage = panel(/vip vs field leverage/i, '.panel-subtle')
  const rows = within(within(leverage).getByRole('table')).getAllByRole('row')
  expect(within(rows[1]).getByText(/Leverage Fixture VIP/i)).toBeInTheDocument()
})

it('shows unavailable threat state when metrics are missing', async () => {
  await renderLive(load(), 'mlb')
  expect(screen.getByText(/threat metrics unavailable for this contest/i)).toBeInTheDocument()
})

it('renders ownership watchlist total and respects top_n_default', async () => {
  const snapshot = load()
  const watchlist = contestOf(snapshot).ownership_watchlist
  watchlist.top_n_default = 1

  await renderLive(snapshot)
  expect(screen.getByText(/ownership remaining total:/i)).toBeInTheDocument()
  expect(screen.getByText(/^top 1$/i)).toBeInTheDocument()
  const leaders = panel(/^ownership leaders$/i, '.panel-subtle')
  expect(within(within(leaders).getByRole('table')).getAllByRole('row')).toHaveLength(2)
})

it('renders ownership summary cards from metrics using stable per-vip keys', async () => {
  const snapshot = load()
  addVip(snapshot)
  contestOf(snapshot).metrics.ownership_summary = {
    source: 'vip_lineup_players',
    scope: 'vip_lineup',
    per_vip: [
      { entry_key: VIP_KEY, total_ownership_pct: 189.78, ownership_in_play_pct: 116.06, is_partial: false },
      { display_name: VIP_NAME, total_ownership_pct: 999.99, ownership_in_play_pct: 999.99, is_partial: true },
    ],
  }

  await renderLive(snapshot)
  const summaryTable = within(panel(/vip ownership summary/i, '.panel-subtle')).getByRole('table')
  const rows = within(summaryTable).getAllByRole('row')
  expect(rows).toHaveLength(2)
  expect(within(rows[1]).getByText(VIP_NAME)).toBeInTheDocument()
  expect(within(rows[1]).getByText('189.78%')).toBeInTheDocument()
  expect(within(summaryTable).queryByText('999.99%')).not.toBeInTheDocument()
})

it('shows the feed-not-provided state for metrics the feed omits', async () => {
  await renderLive(load(), 'mlb')
  expect(screen.getAllByText(/the feed does not provide this metric yet/i).length).toBeGreaterThan(0)
})

it('shows ownership summary empty state when summary rows do not match VIP keys', async () => {
  const snapshot = load()
  addVip(snapshot)
  contestOf(snapshot).metrics.ownership_summary = {
    source: 'vip_lineup_players',
    scope: 'vip_lineup',
    per_vip: [{ entry_key: 'non-matching-entry-key', total_ownership_pct: 10.5, ownership_in_play_pct: 4.2 }],
  }

  await renderLive(snapshot)
  expect(screen.getByText(/no ownership summary rows available for VIP lineups/i)).toBeInTheDocument()
})

it('renders non-cashing panel with users, avg PMR, and top remaining players', async () => {
  const snapshot = load()
  contestOf(snapshot).metrics.non_cashing = {
    users_not_cashing: 109,
    avg_pmr_remaining: 342.83,
    top_remaining_players: [
      { player_name: 'Jalen Johnson', ownership_remaining_pct: 92.66 },
      { player_name: 'Javon Small', ownership_remaining_pct: 88.99 },
    ],
  }

  await renderLive(snapshot)
  const nonCashing = panel(/non-cashing info/i)
  expect(within(nonCashing).getByText(/entries not cashing:\s*109/i)).toBeInTheDocument()
  expect(within(nonCashing).getByText(/avg pmr remaining:\s*342.8$/i)).toBeInTheDocument()
  expect(within(nonCashing).getByText(/top remaining players/i)).toBeInTheDocument()
  expect(within(nonCashing).getByText('Jalen Johnson')).toBeInTheDocument()
  expect(within(nonCashing).getByText('92.66%')).toBeInTheDocument()
})

it('renders avg salary per player remaining from live metrics', async () => {
  const snapshot = load()
  contestOf(snapshot).live_metrics.avg_salary_per_player_remaining = 6158

  await renderLive(snapshot)
  const nonCashing = panel(/non-cashing info/i)
  expect(within(nonCashing).getByText('$6,158')).toBeInTheDocument()
  expect(within(nonCashing).getByRole('heading', { name: /avg salary per player remaining/i })).toBeInTheDocument()
})

it('shows non-cashing empty top-player state when list is present but empty', async () => {
  const snapshot = load()
  contestOf(snapshot).metrics.non_cashing = { users_not_cashing: 0, avg_pmr_remaining: 0, top_remaining_players: [] }

  await renderLive(snapshot)
  expect(within(panel(/non-cashing info/i)).getByText(/no top remaining players available/i)).toBeInTheDocument()
})

it('shows non-cashing top-player unavailable state when section exists but list is missing', async () => {
  const snapshot = load()
  contestOf(snapshot).metrics.non_cashing = { users_not_cashing: 7, avg_pmr_remaining: 123.45 }

  await renderLive(snapshot)
  expect(
    within(panel(/non-cashing info/i)).getByText(/top remaining players unavailable for this contest/i),
  ).toBeInTheDocument()
})

it('shows unavailable placeholders when sections are missing', async () => {
  const snapshot = load()
  const contest = contestOf(snapshot)
  delete contest.ownership_watchlist
  delete contest.train_clusters
  delete contest.standings

  await renderLive(snapshot)
  expect(screen.getByText(/^ownership leaders unavailable for this contest\.$/i)).toBeInTheDocument()
  expect(screen.getByText(/standings unavailable for this contest/i)).toBeInTheDocument()
  expect(screen.queryByText(/cluster/i)).not.toBeInTheDocument()
})

it('renders standings table from the producer snapshot', async () => {
  await renderLive(load())
  const standings = panel(/^standings$/i)
  expect(within(standings).getByText('Rows: 35')).toBeInTheDocument()
  expect(within(standings).getByText('bruc0074')).toBeInTheDocument()
  expect(within(within(standings).getByRole('table')).getAllByRole('row')).toHaveLength(1 + 35)
})

it('shows empty state when standings array has no rows', async () => {
  const snapshot = load()
  contestOf(snapshot).standings = []

  await renderLive(snapshot)
  expect(screen.getByText(/no standings rows available/i)).toBeInTheDocument()
  expect(screen.queryByText(/standings unavailable for this contest/i)).not.toBeInTheDocument()
})

it('does not accept the pre-v3 standings object shape', async () => {
  const snapshot = load()
  contestOf(snapshot).standings = {
    updated_at: '2026-10-03T20:48:31Z',
    rows: [{ entry_key: 'old-row', display_name: 'Old Row', rank: 1, points: 10 }],
  }

  await renderLive(snapshot)
  expect(screen.queryByText('Old Row')).not.toBeInTheDocument()
  expect(screen.getByText(/no standings rows available/i)).toBeInTheDocument()
})

it('shows payout only for paid standings rows', async () => {
  const snapshot = load()
  contestOf(snapshot).standings = [
    { entry_key: 'row-paid', username: 'Paid Row', rank: 1, points: 99.5, pmr: 2, ownership_remaining_total_pct: 15, payout_cents: 1234 },
    { entry_key: 'row-null', username: 'Null Row', rank: 2, points: 88.5, pmr: 3, ownership_remaining_total_pct: 25, payout_cents: null },
  ]

  await renderLive(snapshot)
  const rows = within(within(panel(/^standings$/i)).getByRole('table')).getAllByRole('row')
  expect(within(rows[1]).getByText('Paid Row')).toBeInTheDocument()
  expect(within(rows[1]).getByText('15%')).toBeInTheDocument()
  expect(within(rows[1]).getByText('12.34')).toBeInTheDocument()
  expect(within(rows[2]).getByText('Null Row')).toBeInTheDocument()
  expect(within(rows[2]).getByText('—')).toBeInTheDocument()
})

function pool(overrides: Json[] = []) {
  return overrides.map((row, index) => ({
    player_key: `test:${index}`,
    team: 'FSU',
    position: 'QB',
    roster_positions: ['QB'],
    matchup: 'vs. MIZZ',
    salary: 5000,
    ownership_pct: 0,
    fantasy_points: 0,
    value: 0,
    game_status: 'In-Progress',
    ...row,
  }))
}

/** The Players view table (the player pool moved there from its own section, #23). */
function playersTable() {
  return screen.getByRole('table', { name: /players/i })
}

function playerRow(name: string) {
  const row = within(playersTable()).getByText(name).closest('tr')
  if (!(row instanceof HTMLTableRowElement)) throw new Error(`${name} row not found`)
  return row
}

it('renders player pool with search and default ownership-first sort', async () => {
  const snapshot = load()
  setPlayers(snapshot, pool([
    { name: 'Low Own', ownership_pct: 10, fantasy_points: 40 },
    { name: 'High Own', ownership_pct: 30, fantasy_points: 20 },
  ]))

  await renderLive(snapshot)
  expect(within(within(playersTable()).getAllByRole('row')[1]).getByText('High Own')).toBeInTheDocument()

  fireEvent.change(screen.getByLabelText(/search player/i), { target: { value: 'Low Own' } })
  expect(within(playersTable()).getByText('Low Own')).toBeInTheDocument()
  expect(within(playersTable()).queryByText('High Own')).not.toBeInTheDocument()
})

it('filters irrelevant players using ownership, points, and value signals', async () => {
  const snapshot = load()
  setPlayers(snapshot, pool([
    { name: 'Hidden Player' },
    { name: 'Points Signal', fantasy_points: 1 },
    { name: 'Ownership Signal', ownership_pct: 2 },
    { name: 'Value Signal', value: 1 },
  ]))

  await renderLive(snapshot)
  expect(within(playersTable()).queryByText('Hidden Player')).not.toBeInTheDocument()
  expect(within(playersTable()).getByText('Points Signal')).toBeInTheDocument()
  expect(within(playersTable()).getByText('Ownership Signal')).toBeInTheDocument()
  expect(within(playersTable()).getByText('Value Signal')).toBeInTheDocument()
})

it('trims ownership precision to two decimals for player pool rows', async () => {
  const snapshot = load()
  setPlayers(snapshot, pool([{ name: 'Precision Pool', ownership_pct: 26.97999999999997, fantasy_points: 10, value: 4 }]))

  await renderLive(snapshot)
  expect(within(playerRow('Precision Pool')).getByRole('cell', { name: '26.98%' })).toBeInTheDocument()
})

it('renders player board parity columns position salary ownership points value', async () => {
  const snapshot = load()
  setPlayers(snapshot, pool([
    {
      name: 'Parity Player',
      position: 'QB',
      roster_positions: ['QB', 'S-FLEX'],
      salary: 5100,
      ownership_pct: 2.92,
      fantasy_points: 12.75,
      value: 2.5,
    },
  ]))

  await renderLive(snapshot)
  const table = within(playersTable())
  for (const name of [/^pos$/i, /^player$/i, /^game$/i, /^salary$/i, /^own$/i, /^pts$/i, /^value$/i, /^vips$/i]) {
    expect(table.getByRole('columnheader', { name })).toBeInTheDocument()
  }
  const row = within(playerRow('Parity Player'))
  expect(row.getByRole('cell', { name: 'QB' })).toBeInTheDocument()
  expect(row.getByRole('cell', { name: '$5,100' })).toBeInTheDocument()
  expect(row.getByRole('cell', { name: '2.92%' })).toBeInTheDocument()
  expect(row.getByRole('cell', { name: '12.75' })).toBeInTheDocument()
  expect(row.getByRole('cell', { name: '2.5' })).toBeInTheDocument()
})

it('falls back to roster_positions when position is missing', async () => {
  const snapshot = load()
  setPlayers(snapshot, pool([{ name: 'Roster Only', position: undefined, roster_positions: ['RB', 'S-FLEX'], ownership_pct: 5 }]))

  await renderLive(snapshot)
  expect(within(playerRow('Roster Only')).getByRole('cell', { name: 'RB/S-FLEX' })).toBeInTheDocument()
})

it('renders player pool value badges from thresholds with unknown fallback', async () => {
  const snapshot = load()
  const base = { ownership_pct: 2.92, fantasy_points: 12.75 }
  setPlayers(snapshot, pool([
    { ...base, name: 'Tier Elite', value: 8, salary: 5100 },
    { ...base, name: 'Tier Strong', value: 5, salary: 5200 },
    { ...base, name: 'Tier Medium', value: 3, salary: 5300 },
    { ...base, name: 'Tier Low', value: 2.9, salary: 5400 },
    { ...base, name: 'Tier Unknown', value: '', salary: 5500 },
  ]))

  await renderLive(snapshot)
  expect(within(playerRow('Tier Elite')).getByText('8')).toBeInTheDocument()
  expect(within(playerRow('Tier Strong')).getByText('5')).toBeInTheDocument()
  expect(within(playerRow('Tier Medium')).getByText('3')).toBeInTheDocument()
  expect(within(playerRow('Tier Low')).getByText('2.9')).toBeInTheDocument()
  expect(within(playerRow('Tier Unknown')).getAllByRole('cell')[6]).toHaveTextContent('—')
})

it("shows each player's team next to their name", async () => {
  const snapshot = load()
  setPlayers(snapshot, pool([
    { name: 'Florida Player', team: 'FSU', ownership_pct: 1.25 },
    { name: 'Missouri Player', team: 'MIZZ', ownership_pct: 1.25 },
  ]))

  await renderLive(snapshot)
  expect(within(playerRow('Florida Player')).getByText('FSU')).toBeInTheDocument()
  expect(within(playerRow('Missouri Player')).getByText('MIZZ')).toBeInTheDocument()
})
