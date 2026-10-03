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

function vipCard(name = VIP_NAME) {
  const card = within(panel(/vip board/i))
    .getByText(new RegExp(`^${name}$`, 'i'), { selector: 'p.item-title' })
    .closest('li')
  if (!card) throw new Error('Lineup card not found')
  return card
}

const PLAYERS_LIVE_ROW = {
  slot: 'QB',
  player_name: 'Ashton Daniels',
  ownership_pct: 84.67,
  salary: 3500,
  points: 7.25,
  value: 2.07,
  rt_projection: 21.11,
  time_remaining_display: '38.02',
  stats_text: '1 TD',
  game_status: 'In Progress',
}

it('resolves and renders the selected primary contest for live route', async () => {
  await renderLive(load())
  expect(screen.getByRole('heading', { name: /primary contest/i })).toBeInTheDocument()
  expect(screen.getByText(/contest key:/i)).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: /vip board/i })).toBeInTheDocument()
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

it('uses payout_cents as cashing truth for VIP lineups', async () => {
  const snapshot = load()
  addVip(snapshot, 'cfb', { display_name: 'Payout Truth Test', payout_cents: 100, live: { is_cashing: false } })

  await renderLive(snapshot)
  expect(within(vipCard('Payout Truth Test')).getByText(/^cashing$/i)).toBeInTheDocument()
})

it('renders distance-to-cash metrics from schema v3 snapshots', async () => {
  const snapshot = load()
  addVip(snapshot)
  contestOf(snapshot).metrics.distance_to_cash = {
    per_vip: [{ entry_key: VIP_KEY, display_name: VIP_NAME, points_delta: 11, rank_delta: 44 }],
  }

  await renderLive(snapshot)
  const card = vipCard()
  expect(within(card).getByText(/distance to cash: \+11 pts/i)).toBeInTheDocument()
  expect(within(card).getByText(/rank delta: \+44/i)).toBeInTheDocument()
  expect(within(card).getByText(/^cashing$/i)).toBeInTheDocument()
})

it('shows unavailable distance-to-cash when metrics are missing', async () => {
  const snapshot = load()
  addVip(snapshot, 'mlb')
  await renderLive(snapshot, 'mlb')
  expect(within(vipCard()).getByText(/distance to cash: unavailable/i)).toBeInTheDocument()
})

it('does not join distance metrics by display_name fallback', async () => {
  const snapshot = load()
  addVip(snapshot)
  contestOf(snapshot).metrics.distance_to_cash = {
    per_vip: [{ vip_entry_key: null, entry_key: null, display_name: VIP_NAME, points_delta: 99, rank_delta: 99 }],
  }

  await renderLive(snapshot)
  const card = vipCard()
  expect(within(card).getByText(/distance to cash: unavailable/i)).toBeInTheDocument()
  expect(within(card).getByText(/^not cashing$/i)).toBeInTheDocument()
})

it('renders VIP players_live table rows when details are available', async () => {
  const snapshot = load()
  addVip(snapshot, 'cfb', { players_live: [PLAYERS_LIVE_ROW] })

  await renderLive(snapshot)
  const playerTable = within(vipCard()).getByRole('table')
  expect(within(playerTable).getByRole('columnheader', { name: /rt proj/i })).toBeInTheDocument()
  expect(within(playerTable).getByRole('cell', { name: 'Ashton Daniels' })).toBeInTheDocument()
  expect(within(playerTable).getByRole('cell', { name: '$3,500' })).toBeInTheDocument()
  expect(within(playerTable).getByRole('cell', { name: 'In Progress' })).toBeInTheDocument()
})

it('renders value badges for vip players_live rows', async () => {
  const snapshot = load()
  addVip(snapshot, 'cfb', {
    players_live: [
      { ...PLAYERS_LIVE_ROW, player_name: 'VIP Elite', value: 8.1 },
      { ...PLAYERS_LIVE_ROW, slot: 'RB', player_name: 'VIP Unknown', value: null },
    ],
  })

  await renderLive(snapshot)
  const rows = within(within(vipCard()).getByRole('table')).getAllByRole('row')
  expect(within(rows[1]).getByText('8.1')).toBeInTheDocument()
  expect(within(rows[2]).getByText('N/A')).toBeInTheDocument()
})

it('renders VIP players_live empty state when details list is present but empty', async () => {
  const snapshot = load()
  addVip(snapshot, 'cfb', { players_live: [] })

  await renderLive(snapshot)
  expect(within(vipCard()).getByText(/no player live details available/i)).toBeInTheDocument()
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

it('renders VIP slot names directly from name-only fields', async () => {
  const snapshot = load()
  addVip(snapshot, 'cfb', { slots: [{ slot: 'QB', player_name: 'Unknown Slot Name' }], players_live: null })

  await renderLive(snapshot)
  expect(screen.getByText(/Unknown Slot Name/i)).toBeInTheDocument()
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
  expect(within(nonCashing).getByText(/users not cashing:\s*109/i)).toBeInTheDocument()
  expect(within(nonCashing).getByText(/avg pmr remaining:\s*342.83/i)).toBeInTheDocument()
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
  expect(screen.getByText(/ownership watchlist unavailable for this contest/i)).toBeInTheDocument()
  expect(screen.getByText(/train data unavailable for this contest/i)).toBeInTheDocument()
  expect(screen.getByText(/standings unavailable for this contest/i)).toBeInTheDocument()
  expect(screen.queryByText(/cluster/i)).not.toBeInTheDocument()
})

it('has no show-all toggle: every emitted train is listed', async () => {
  await renderLive(load())
  const trains = panel(/train finder/i)
  expect(within(trains).queryByRole('button')).not.toBeInTheDocument()
  expect(within(within(trains).getByRole('table')).getAllByRole('row')).toHaveLength(1 + 24)
})

it('shows the train unavailable state for malformed train rows', async () => {
  const snapshot = load()
  contestOf(snapshot).train_clusters = [null, 'invalid-row', { cluster_id: 123, user_count: 'x' }, { entry_keys: [42] }]

  await renderLive(snapshot)
  expect(screen.getByText(/train data unavailable for this contest/i)).toBeInTheDocument()
})

it('does not accept the pre-v3 train_clusters object shape', async () => {
  const snapshot = load()
  contestOf(snapshot).train_clusters = {
    updated_at: '2026-10-03T20:48:31Z',
    cluster_rule: { type: 'shared_slots', min_shared: 8 },
    clusters: [{ cluster_key: 'old', entry_count: 9, composition: [{ slot: 'QB', player_name: 'Old Shape' }] }],
  }

  await renderLive(snapshot)
  expect(screen.getByText(/train data unavailable for this contest/i)).toBeInTheDocument()
  expect(screen.queryByText(/Old Shape/)).not.toBeInTheDocument()
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

function playerPanel() {
  return panel(/player pool/i)
}

it('renders player pool with search and default ownership-first sort', async () => {
  const snapshot = load()
  setPlayers(snapshot, pool([
    { name: 'Low Own', ownership_pct: 10, fantasy_points: 40 },
    { name: 'High Own', ownership_pct: 30, fantasy_points: 20 },
  ]))

  await renderLive(snapshot)
  expect(within(within(playerPanel()).getAllByRole('row')[1]).getByText('High Own')).toBeInTheDocument()

  fireEvent.change(screen.getByLabelText(/search players/i), { target: { value: 'Low Own' } })
  expect(within(playerPanel()).getByRole('cell', { name: 'Low Own' })).toBeInTheDocument()
  expect(within(playerPanel()).queryByRole('cell', { name: 'High Own' })).not.toBeInTheDocument()
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
  expect(within(playerPanel()).queryByRole('cell', { name: 'Hidden Player' })).not.toBeInTheDocument()
  expect(within(playerPanel()).getByRole('cell', { name: 'Points Signal' })).toBeInTheDocument()
  expect(within(playerPanel()).getByRole('cell', { name: 'Ownership Signal' })).toBeInTheDocument()
  expect(within(playerPanel()).getByRole('cell', { name: 'Value Signal' })).toBeInTheDocument()
})

it('trims ownership precision to two decimals for VIP and player pool rows', async () => {
  const snapshot = load()
  addVip(snapshot, 'cfb', { players_live: [{ ...PLAYERS_LIVE_ROW, ownership_pct: 26.97999999999997 }] })
  setPlayers(snapshot, pool([{ name: 'Precision Pool', ownership_pct: 26.97999999999997, fantasy_points: 10, value: 4 }]))

  await renderLive(snapshot)
  expect(within(within(vipCard()).getByRole('table')).getByRole('cell', { name: '26.98%' })).toBeInTheDocument()
  expect(within(within(playerPanel()).getByRole('table')).getByRole('cell', { name: '26.98%' })).toBeInTheDocument()
})

it('renders player board parity columns position matchup salary points value ownership', async () => {
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
  const view = within(playerPanel())
  for (const name of [/^position$/i, /^matchup$/i, /^salary$/i, /^points$/i, /^value$/i]) {
    expect(view.getByRole('columnheader', { name })).toBeInTheDocument()
  }
  expect(view.getByRole('cell', { name: 'QB' })).toBeInTheDocument()
  expect(view.getByRole('cell', { name: '$5,100' })).toBeInTheDocument()
  expect(view.getByRole('cell', { name: '12.8' })).toBeInTheDocument()
  expect(view.getByRole('cell', { name: '2.5' })).toBeInTheDocument()
})

it('falls back to roster_positions when position is missing', async () => {
  const snapshot = load()
  setPlayers(snapshot, pool([{ name: 'Roster Only', position: undefined, roster_positions: ['RB', 'S-FLEX'], ownership_pct: 5 }]))

  await renderLive(snapshot)
  const row = within(playerPanel()).getByText('Roster Only').closest('tr')
  if (!(row instanceof HTMLTableRowElement)) throw new Error('Player row not found')
  expect(within(row).getByRole('cell', { name: 'RB/S-FLEX' })).toBeInTheDocument()
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
  const rows = within(within(playerPanel()).getByRole('table')).getAllByRole('row')
  expect(within(rows[1]).getByText('8')).toBeInTheDocument()
  expect(within(rows[2]).getByText('5')).toBeInTheDocument()
  expect(within(rows[3]).getByText('3')).toBeInTheDocument()
  expect(within(rows[4]).getByText('2.9')).toBeInTheDocument()
  expect(within(rows[5]).getByText('N/A')).toBeInTheDocument()
})

it('applies team accent classes to player pool rows with alias normalization and neutral fallback', async () => {
  // Team accent tokens are defined for nba, which the producer fixture does not carry,
  // so present the cfb payload under the nba key.
  const snapshot = load()
  snapshot.sports.nba = structuredClone(snapshot.sports.cfb)
  setPlayers(
    snapshot,
    pool([
      { name: 'Alias Team', team: 'GS', ownership_pct: 1.25 },
      { name: 'Canonical Team', team: 'GSW', ownership_pct: 1.25 },
      { name: 'Unknown Team', team: 'ZZZ', ownership_pct: 1.25 },
    ]),
    'nba',
  )

  await renderLive(snapshot, 'nba')
  const rowOf = (name: string) => {
    const row = within(playerPanel()).getByText(name).closest('tr')
    if (!(row instanceof HTMLTableRowElement)) throw new Error(`${name} row not found`)
    return row
  }
  expect(rowOf('Alias Team').className).toContain('team-accent')
  expect(rowOf('Alias Team').className).toContain('team-accent--nba-gsw')
  expect(rowOf('Canonical Team').className).toContain('team-accent--nba-gsw')
  expect(rowOf('Unknown Team').className).toContain('team-accent--neutral')
})

it('does not apply team accent classes to vip players_live rows', async () => {
  const snapshot = load()
  addVip(snapshot, 'cfb', { players_live: [{ ...PLAYERS_LIVE_ROW, player_name: 'VIP Team Match' }] })
  setPlayers(snapshot, pool([{ name: 'VIP Team Match', team: 'FSU', ownership_pct: 10, fantasy_points: 25 }]))

  await renderLive(snapshot)
  const vipRow = within(within(vipCard()).getByRole('table')).getByText('VIP Team Match').closest('tr')
  if (!(vipRow instanceof HTMLTableRowElement)) throw new Error('VIP player row not found')
  expect(vipRow.className).not.toContain('team-accent')
})
