import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import snapshotFixture from '../../public/mock/snapshots/canonical-live-snapshot.json'
import emptyStandingsFixture from '../../public/mock/snapshots/canonical-live-snapshot-empty-standings.json'
import missingSectionsFixture from '../../public/mock/snapshots/canonical-live-snapshot-missing-sections.json'
import noPrimaryFixture from '../../public/mock/snapshots/canonical-live-snapshot-no-primary.json'
import v2Fixture from '../../public/mock/snapshots/canonical-live-snapshot.v2.json'
import v2MissingMetricsFixture from '../../public/mock/snapshots/canonical-live-snapshot.v2-missing-metrics.json'
import Live from '../routes/Live'

afterEach(() => {
  vi.restoreAllMocks()
  cleanup()
})

function mockLatestAndSnapshot(snapshot: unknown, snapshotPath = 'snapshots/canonical-live-snapshot.json') {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.includes('/api/latest') || url.includes('/mock/latest.json')) {
        return new Response(
          JSON.stringify({
            latest_snapshot_path: snapshotPath,
            snapshot_at: '2026-02-13T18:25:00Z',
            generated_at: '2026-02-13T18:25:07Z',
            available_sports: ['nba', 'nfl'],
            manifest_today_path: 'manifest/2026-02-13.json',
          }),
          { status: 200 },
        )
      }

      return new Response(JSON.stringify(snapshot), { status: 200 })
    }),
  )
}

async function renderLive(snapshot: unknown, path = 'snapshots/canonical-live-snapshot.json') {
  mockLatestAndSnapshot(snapshot, path)

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/live/nba']}>
        <Routes>
          <Route path="/live/:sport" element={<Live />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )

  fireEvent.change(screen.getByLabelText(/access key/i), { target: { value: 'test-key' } })
  fireEvent.click(screen.getByRole('button', { name: /save key/i }))

  await screen.findByRole('heading', { name: /live: nba/i })
}

it('resolves and renders the selected primary contest for live route', async () => {
  await renderLive(snapshotFixture)
  expect(screen.getByRole('heading', { name: /primary contest/i })).toBeInTheDocument()
  expect(screen.getByText(/contest key:/i)).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: /vip board/i })).toBeInTheDocument()
  expect(screen.getByText(/selection reason:/i)).toBeInTheDocument()
})

it('shows explicit state when primary contest is not configured', async () => {
  await renderLive(noPrimaryFixture)
  expect(screen.getByText(/primary contest is not configured for this sport/i)).toBeInTheDocument()
})

it('prefers contest.is_primary before primary_contest key/id fallbacks', async () => {
  const snapshotWithConflictingPointers = structuredClone(snapshotFixture) as any
  snapshotWithConflictingPointers.sports.nba.primary_contest = {
    contest_id: '1002',
    contest_key: 'nba:1002',
    selection_reason: 'conflict-for-test',
    selected_at: '2026-02-13T18:25:05Z',
  }
  const primaryByFlag = snapshotWithConflictingPointers.sports.nba.contests.find((contest: any) => contest.is_primary === true)

  await renderLive(snapshotWithConflictingPointers)
  expect(screen.getByText(new RegExp(`contest id: ${primaryByFlag.contest_id}`, 'i'))).toBeInTheDocument()
  expect(screen.queryByText(/contest id: 1002/i)).not.toBeInTheDocument()
})

it('uses payout_cents as cashing truth for VIP lineups', async () => {
  const snapshotWithConflictingCashingSignals = structuredClone(snapshotFixture) as any
  snapshotWithConflictingCashingSignals.sports.nba.contests[0].vip_lineups[0].display_name = 'Payout Truth Test'
  snapshotWithConflictingCashingSignals.sports.nba.contests[0].vip_lineups[0].payout_cents = 100
  snapshotWithConflictingCashingSignals.sports.nba.contests[0].vip_lineups[0].live = {
    ...(snapshotWithConflictingCashingSignals.sports.nba.contests[0].vip_lineups[0].live ?? {}),
    is_cashing: false,
  }

  await renderLive(snapshotWithConflictingCashingSignals)
  const fallbackCard = screen.getByText(/payout truth test/i).closest('li')
  if (!fallbackCard) {
    throw new Error('Fallback lineup card not found')
  }
  expect(within(fallbackCard).getByText(/^cashing$/i)).toBeInTheDocument()
})

it('renders distance-to-cash metrics from schema v2 snapshots', async () => {
  await renderLive(v2Fixture, 'snapshots/canonical-live-snapshot.v2.json')
  const vipPanel = screen.getByRole('heading', { name: /vip board/i }).closest('.panel')
  if (!(vipPanel instanceof HTMLElement)) {
    throw new Error('VIP panel not found')
  }
  const lineupCard = within(vipPanel).getByText(/cglenn91/i).closest('li')
  if (!lineupCard) {
    throw new Error('Lineup card not found')
  }
  expect(within(lineupCard).getByText(/distance to cash: \+11 pts/i)).toBeInTheDocument()
  expect(within(lineupCard).getByText(/rank delta: \+44/i)).toBeInTheDocument()
  expect(within(lineupCard).getByText(/^cashing$/i)).toBeInTheDocument()
})

it('shows unavailable distance-to-cash when metrics are missing', async () => {
  await renderLive(v2MissingMetricsFixture, 'snapshots/canonical-live-snapshot.v2-missing-metrics.json')
  const vipPanel = screen.getByRole('heading', { name: /vip board/i }).closest('.panel')
  if (!(vipPanel instanceof HTMLElement)) {
    throw new Error('VIP panel not found')
  }
  const lineupCard = within(vipPanel).getByText(/cglenn91/i).closest('li')
  if (!lineupCard) {
    throw new Error('Lineup card not found')
  }
  expect(within(lineupCard).getByText(/distance to cash: unavailable/i)).toBeInTheDocument()
})

it('does not join distance metrics by display_name fallback', async () => {
  const snapshotWithoutStableMetricKeys = structuredClone(v2Fixture) as any
  const firstMetricRow = snapshotWithoutStableMetricKeys.sports.nba.contests[0].metrics.distance_to_cash.per_vip[0]
  firstMetricRow.vip_entry_key = null
  firstMetricRow.entry_key = null
  firstMetricRow.points_delta = 99
  firstMetricRow.rank_delta = 99

  await renderLive(snapshotWithoutStableMetricKeys, 'snapshots/canonical-live-snapshot.v2.json')
  const vipPanel = screen.getByRole('heading', { name: /vip board/i }).closest('.panel')
  if (!(vipPanel instanceof HTMLElement)) {
    throw new Error('VIP panel not found')
  }
  const lineupCard = within(vipPanel).getByText(/cglenn91/i).closest('li')
  if (!lineupCard) {
    throw new Error('Lineup card not found')
  }
  expect(within(lineupCard).getByText(/distance to cash: unavailable/i)).toBeInTheDocument()
  expect(within(lineupCard).getByText(/^not cashing$/i)).toBeInTheDocument()
})

it('renders VIP players_live table rows when details are available', async () => {
  const snapshotWithPlayersLive = structuredClone(v2Fixture) as any
  const vip = snapshotWithPlayersLive.sports.nba.contests[0].vip_lineups[0]
  vip.players_live = [
    {
      slot: 'PG',
      player_name: 'Javon Small',
      ownership_pct: 84.67,
      salary: 3500,
      points: 7.25,
      value: 2.07,
      rt_projection: 21.11,
      time_remaining_display: '38.02',
      stats_text: '1 REB, 1 STL, 4 PTS',
      game_status: 'In Progress',
    },
  ]

  await renderLive(snapshotWithPlayersLive, 'snapshots/canonical-live-snapshot.v2.json')
  const vipPanel = screen.getByRole('heading', { name: /vip board/i }).closest('.panel')
  if (!(vipPanel instanceof HTMLElement)) {
    throw new Error('VIP panel not found')
  }
  const lineupCard = within(vipPanel).getByText(/cglenn91/i).closest('li')
  if (!lineupCard) {
    throw new Error('Lineup card not found')
  }
  const playerTable = within(lineupCard).getByRole('table')
  expect(within(playerTable).getByRole('columnheader', { name: /rt proj/i })).toBeInTheDocument()
  expect(within(playerTable).getByRole('cell', { name: 'Javon Small' })).toBeInTheDocument()
  expect(within(playerTable).getByRole('cell', { name: '$3,500' })).toBeInTheDocument()
  expect(within(playerTable).getByRole('cell', { name: 'In Progress' })).toBeInTheDocument()
})

it('renders VIP players_live empty state when details list is present but empty', async () => {
  const snapshotWithEmptyPlayersLive = structuredClone(v2Fixture) as any
  snapshotWithEmptyPlayersLive.sports.nba.contests[0].vip_lineups[0].players_live = []

  await renderLive(snapshotWithEmptyPlayersLive, 'snapshots/canonical-live-snapshot.v2.json')
  const vipPanel = screen.getByRole('heading', { name: /vip board/i }).closest('.panel')
  if (!(vipPanel instanceof HTMLElement)) {
    throw new Error('VIP panel not found')
  }
  const lineupCard = within(vipPanel).getByText(/cglenn91/i).closest('li')
  if (!lineupCard) {
    throw new Error('Lineup card not found')
  }
  expect(within(lineupCard).getByText(/no player live details available/i)).toBeInTheDocument()
})

it('renders threat metrics from schema v2 snapshots', async () => {
  await renderLive(v2Fixture, 'snapshots/canonical-live-snapshot.v2.json')
  const threatPanel = screen.getByRole('heading', { name: /threat & leverage/i }).closest('.panel')
  if (!(threatPanel instanceof HTMLElement)) {
    throw new Error('Threat panel not found')
  }
  const swingCard = within(threatPanel).getByText(/Naji Marshall/i).closest('li')
  if (!swingCard) {
    throw new Error('Swing card not found')
  }
  expect(within(swingCard).getByText(/VIP x2/i)).toBeInTheDocument()
  const leveragePanel = within(threatPanel).getByRole('heading', { name: /vip vs field leverage/i }).closest('.panel-subtle')
  if (!(leveragePanel instanceof HTMLElement)) {
    throw new Error('Leverage panel not found')
  }
  const leverageTable = within(leveragePanel).getByRole('table')
  const leverageRows = within(leverageTable).getAllByRole('row')
  expect(within(leverageRows[1]).getByText(/cglenn91/i)).toBeInTheDocument()
})

it('shows unavailable threat state when metrics are missing', async () => {
  await renderLive(v2MissingMetricsFixture, 'snapshots/canonical-live-snapshot.v2-missing-metrics.json')
  expect(screen.getByText(/threat metrics unavailable for this contest/i)).toBeInTheDocument()
})

it('renders VIP and train slot names directly from name-only fields', async () => {
  const snapshotWithUnknownNames = structuredClone(snapshotFixture) as any
  snapshotWithUnknownNames.sports.nba.contests[0].vip_lineups[0].slots[0].player_name = 'Unknown Slot Name'
  snapshotWithUnknownNames.sports.nba.contests[0].train_clusters.clusters[0].composition[0].player_name =
    'Unknown Composition Name'

  await renderLive(snapshotWithUnknownNames)
  expect(screen.getByText(/Unknown Slot Name/i)).toBeInTheDocument()
  expect(screen.getByText(/Unknown Composition Name/i)).toBeInTheDocument()
})

it('renders ownership watchlist total and respects top_n_default', async () => {
  const snapshotWithTopN = structuredClone(snapshotFixture) as any
  snapshotWithTopN.sports.nba.contests[0].ownership_watchlist.entries = [
    {
      entry_key: 'ownership-entry-1',
      display_name: 'Ownership Entry',
      ownership_remaining_pct: 22.2,
      pmr: 1,
      current_rank: 3,
      current_points: 99.1,
    },
  ]
  snapshotWithTopN.sports.nba.contests[0].ownership_watchlist.top_n_default = 1

  await renderLive(snapshotWithTopN)
  expect(screen.getByText(/ownership remaining total:/i)).toBeInTheDocument()
  expect(screen.getByText(/^top 1$/i)).toBeInTheDocument()
  const ownershipPanel = screen.getByRole('heading', { level: 2, name: /^ownership remaining$/i }).closest('.panel')
  if (!(ownershipPanel instanceof HTMLElement)) {
    throw new Error('Ownership panel not found')
  }
  const ownershipTable = within(ownershipPanel).getByRole('table')
  expect(within(ownershipTable).getAllByRole('row')).toHaveLength(2)
})

it('renders ownership summary cards from metrics using stable per-vip keys', async () => {
  const snapshotWithOwnershipSummary = structuredClone(v2Fixture) as any
  snapshotWithOwnershipSummary.sports.nba.contests[0].metrics.ownership_summary = {
    source: 'vip_lineup_players',
    scope: 'vip_lineup',
    per_vip: [
      {
        entry_key: '5067365318',
        total_ownership_pct: 189.78,
        ownership_in_play_pct: 116.06,
        is_partial: false,
      },
      {
        display_name: 'cglenn91',
        total_ownership_pct: 999.99,
        ownership_in_play_pct: 999.99,
        is_partial: true,
      },
    ],
  }

  await renderLive(snapshotWithOwnershipSummary, 'snapshots/canonical-live-snapshot.v2.json')
  const ownershipPanel = screen.getByRole('heading', { level: 2, name: /^ownership remaining$/i }).closest('.panel')
  if (!(ownershipPanel instanceof HTMLElement)) {
    throw new Error('Ownership panel not found')
  }
  const summaryPanel = within(ownershipPanel).getByRole('heading', { name: /vip ownership summary/i }).closest('.panel-subtle')
  if (!(summaryPanel instanceof HTMLElement)) {
    throw new Error('Ownership summary panel not found')
  }
  const summaryTable = within(summaryPanel).getByRole('table')
  const rows = within(summaryTable).getAllByRole('row')
  expect(rows).toHaveLength(2)
  expect(within(rows[1]).getByText('cglenn91')).toBeInTheDocument()
  expect(within(rows[1]).getByText('189.78%')).toBeInTheDocument()
  expect(within(summaryTable).queryByText('999.99%')).not.toBeInTheDocument()
})

it('shows ownership summary unavailable state when summary metrics are missing', async () => {
  await renderLive(v2MissingMetricsFixture, 'snapshots/canonical-live-snapshot.v2-missing-metrics.json')
  expect(screen.getByText(/ownership summary metrics unavailable for this contest/i)).toBeInTheDocument()
})

it('shows ownership summary empty state when summary rows do not match VIP keys', async () => {
  const snapshotWithUnmatchedOwnershipRows = structuredClone(v2Fixture) as any
  snapshotWithUnmatchedOwnershipRows.sports.nba.contests[0].metrics.ownership_summary = {
    source: 'vip_lineup_players',
    scope: 'vip_lineup',
    per_vip: [
      {
        entry_key: 'non-matching-entry-key',
        total_ownership_pct: 10.5,
        ownership_in_play_pct: 4.2,
        is_partial: false,
      },
    ],
  }

  await renderLive(snapshotWithUnmatchedOwnershipRows, 'snapshots/canonical-live-snapshot.v2.json')
  expect(screen.getByText(/no ownership summary rows available for VIP lineups/i)).toBeInTheDocument()
})

it('renders non-cashing panel with users, avg PMR, and top remaining players', async () => {
  const snapshotWithNonCashing = structuredClone(v2Fixture) as any
  snapshotWithNonCashing.sports.nba.contests[0].metrics.non_cashing = {
    users_not_cashing: 109,
    avg_pmr_remaining: 342.83,
    top_remaining_players: [
      { player_name: 'Jalen Johnson', ownership_remaining_pct: 92.66 },
      { player_name: 'Javon Small', ownership_remaining_pct: 88.99 },
    ],
  }

  await renderLive(snapshotWithNonCashing, 'snapshots/canonical-live-snapshot.v2.json')
  const panel = screen.getByRole('heading', { name: /non-cashing info/i }).closest('.panel')
  if (!(panel instanceof HTMLElement)) {
    throw new Error('Non-cashing panel not found')
  }
  expect(within(panel).getByText(/users not cashing:\s*109/i)).toBeInTheDocument()
  expect(within(panel).getByText(/avg pmr remaining:\s*342.83/i)).toBeInTheDocument()
  expect(within(panel).getByText(/top remaining players/i)).toBeInTheDocument()
  expect(within(panel).getByText('Jalen Johnson')).toBeInTheDocument()
  expect(within(panel).getByText('92.66%')).toBeInTheDocument()
})

it('shows non-cashing unavailable state when metrics are missing', async () => {
  await renderLive(v2MissingMetricsFixture, 'snapshots/canonical-live-snapshot.v2-missing-metrics.json')
  expect(screen.getByText(/non-cashing metrics unavailable for this contest/i)).toBeInTheDocument()
})

it('shows non-cashing empty top-player state when list is present but empty', async () => {
  const snapshotWithEmptyTopRemaining = structuredClone(v2Fixture) as any
  snapshotWithEmptyTopRemaining.sports.nba.contests[0].metrics.non_cashing = {
    users_not_cashing: 0,
    avg_pmr_remaining: 0,
    top_remaining_players: [],
  }

  await renderLive(snapshotWithEmptyTopRemaining, 'snapshots/canonical-live-snapshot.v2.json')
  const panel = screen.getByRole('heading', { name: /non-cashing info/i }).closest('.panel')
  if (!(panel instanceof HTMLElement)) {
    throw new Error('Non-cashing panel not found')
  }
  expect(within(panel).getByText(/no top remaining players available/i)).toBeInTheDocument()
})

it('shows non-cashing top-player unavailable state when section exists but list is missing', async () => {
  const snapshotWithMissingTopPlayers = structuredClone(v2Fixture) as any
  snapshotWithMissingTopPlayers.sports.nba.contests[0].metrics.non_cashing = {
    users_not_cashing: 7,
    avg_pmr_remaining: 123.45,
  }

  await renderLive(snapshotWithMissingTopPlayers, 'snapshots/canonical-live-snapshot.v2.json')
  const panel = screen.getByRole('heading', { name: /non-cashing info/i }).closest('.panel')
  if (!(panel instanceof HTMLElement)) {
    throw new Error('Non-cashing panel not found')
  }
  expect(within(panel).getByText(/top remaining players unavailable for this contest/i)).toBeInTheDocument()
})

it('shows unavailable placeholders when sections are missing', async () => {
  await renderLive(missingSectionsFixture)
  expect(screen.getByText(/ownership watchlist unavailable for this contest/i)).toBeInTheDocument()
  expect(screen.getByText(/train cluster data unavailable for this contest/i)).toBeInTheDocument()
  expect(screen.getByText(/standings unavailable for this contest/i)).toBeInTheDocument()
})

it('renders train clusters with cluster rule and sorts by entry_count desc', async () => {
  const snapshotWithSortedClusters = structuredClone(snapshotFixture) as any
  snapshotWithSortedClusters.sports.nba.contests[0].train_clusters.clusters.push({
    cluster_key: 'cluster-sort-test',
    entry_count: 25,
    best_rank: 15,
    best_points: 153.4,
    avg_pmr: 1.8,
    avg_ownership_remaining_pct: 50.5,
    composition: [
      { slot: 'PG', player_name: 'Guard One' },
      { slot: 'SG', player_name: 'Guard Two' },
    ],
    sample_entries: [
      { entry_key: 'entry-b-1', display_name: 'Sample B1' },
      { entry_key: 'entry-b-2', display_name: 'Sample B2' },
      { entry_key: 'entry-b-3', display_name: 'Sample B3' },
      { entry_key: 'entry-b-4', display_name: 'Sample B4' },
    ],
  })

  await renderLive(snapshotWithSortedClusters)
  const trainPanel = screen.getByRole('heading', { name: /train finder/i }).closest('.panel')
  if (!(trainPanel instanceof HTMLElement)) {
    throw new Error('Train panel not found')
  }
  const trainTable = within(trainPanel).getByRole('table')
  const tableRows = within(trainTable).getAllByRole('row')
  expect(tableRows.length).toBeGreaterThan(1)
  expect(within(tableRows[1]).getByText('cluster-sort-test')).toBeInTheDocument()
  expect(screen.queryByText(/Sample B4/i)).not.toBeInTheDocument()
})

it('uses train metrics top clusters by default and toggles full list', async () => {
  await renderLive(v2Fixture, 'snapshots/canonical-live-snapshot.v2.json')
  const trainPanel = screen.getByRole('heading', { name: /train finder/i }).closest('.panel')
  if (!(trainPanel instanceof HTMLElement)) {
    throw new Error('Train panel not found')
  }
  const trainTable = within(trainPanel).getByRole('table')
  expect(within(trainTable).queryByText('e74fb79a025e')).not.toBeInTheDocument()
  const toggleButton = within(trainPanel).getByRole('button', { name: /show all clusters/i })
  fireEvent.click(toggleButton)
  expect(within(trainTable).getByText('e74fb79a025e')).toBeInTheDocument()
})

it('renders standings table when standings data is present', async () => {
  await renderLive(snapshotFixture)
  const standingsPanel = screen.getByRole('heading', { name: /standings/i }).closest('.panel')
  if (!(standingsPanel instanceof HTMLElement)) {
    throw new Error('Standings panel not found')
  }
  expect(within(standingsPanel).getByText(/updated:/i)).toBeInTheDocument()
  expect(within(standingsPanel).getByText(/^Rows:/i)).toBeInTheDocument()
  const standingsTable = within(standingsPanel).getByRole('table')
  expect(within(standingsTable).getAllByRole('row').length).toBeGreaterThan(1)
})

it('shows empty state when standings object exists but has no rows', async () => {
  await renderLive(emptyStandingsFixture)
  expect(screen.getByText(/no standings rows available/i)).toBeInTheDocument()
  expect(screen.queryByText(/standings unavailable for this contest/i)).not.toBeInTheDocument()
})

it('uses payout_cents presence for standings cashing semantics', async () => {
  const snapshotWithMixedPayouts = structuredClone(snapshotFixture) as any
  snapshotWithMixedPayouts.sports.nba.contests[0].standings.rows = [
    {
      entry_key: 'row-paid',
      display_name: 'Paid Row',
      rank: 1,
      points: 99.5,
      pmr: 2,
      ownership_remaining_pct: 15,
      payout_cents: 1234,
    },
    {
      entry_key: 'row-null',
      display_name: 'Null Row',
      rank: 2,
      points: 88.5,
      pmr: 3,
      ownership_remaining_pct: 25,
      payout_cents: null,
    },
  ]

  await renderLive(snapshotWithMixedPayouts)
  const standingsPanel = screen.getByRole('heading', { name: /standings/i }).closest('.panel')
  if (!(standingsPanel instanceof HTMLElement)) {
    throw new Error('Standings panel not found')
  }
  const standingsTable = within(standingsPanel).getByRole('table')
  const rows = within(standingsTable).getAllByRole('row')
  expect(within(rows[1]).getByText('Paid Row')).toBeInTheDocument()
  expect(within(rows[1]).getByText('12.34')).toBeInTheDocument()
  expect(within(rows[2]).getByText('Null Row')).toBeInTheDocument()
  expect(within(rows[2]).getByText('—')).toBeInTheDocument()
})

it('renders player pool with search and default ownership-first sort', async () => {
  const snapshotWithPlayers = structuredClone(snapshotFixture) as any
  snapshotWithPlayers.sports.nba.players = [
    {
      player_id: 'p-low',
      name: 'Low Own',
      team: 'A',
      positions: ['PG'],
      salary: 5000,
      status: 'active',
      ownership_pct: 10,
      actual_points: 40,
    },
    {
      player_id: 'p-high',
      name: 'High Own',
      team: 'B',
      positions: ['SG'],
      salary: 6000,
      status: 'active',
      ownership_pct: 30,
      actual_points: 20,
    },
  ]

  await renderLive(snapshotWithPlayers)
  const playerPanel = screen.getByRole('heading', { name: /player pool/i }).closest('.panel')
  if (!(playerPanel instanceof HTMLElement)) {
    throw new Error('Player panel not found')
  }

  const playerRows = within(playerPanel).getAllByRole('row')
  expect(within(playerRows[1]).getByText('High Own')).toBeInTheDocument()

  fireEvent.change(screen.getByLabelText(/search players/i), { target: { value: 'Low Own' } })
  expect(within(playerPanel).getByRole('cell', { name: 'Low Own' })).toBeInTheDocument()
  expect(within(playerPanel).queryByRole('cell', { name: 'High Own' })).not.toBeInTheDocument()
})

it('renders player board parity columns position matchup salary points value ownership', async () => {
  const snapshotWithParityPlayers = structuredClone(snapshotFixture) as any
  snapshotWithParityPlayers.sports.nba.players = [
    {
      name: 'Parity Player',
      team: 'DAL',
      position: 'PG/SG',
      matchup: 'vs. MIN',
      salary: 5100,
      ownership_pct: 2.92,
      fantasy_points: 12.75,
      value: 2.5,
      game_status: 'In Progress',
    },
  ]

  await renderLive(snapshotWithParityPlayers)
  const playerPanel = screen.getByRole('heading', { name: /player pool/i }).closest('.panel')
  if (!(playerPanel instanceof HTMLElement)) {
    throw new Error('Player panel not found')
  }
  expect(within(playerPanel).getByRole('columnheader', { name: /^position$/i })).toBeInTheDocument()
  expect(within(playerPanel).getByRole('columnheader', { name: /^matchup$/i })).toBeInTheDocument()
  expect(within(playerPanel).getByRole('columnheader', { name: /^salary$/i })).toBeInTheDocument()
  expect(within(playerPanel).getByRole('columnheader', { name: /^points$/i })).toBeInTheDocument()
  expect(within(playerPanel).getByRole('columnheader', { name: /^value$/i })).toBeInTheDocument()
  expect(within(playerPanel).getByRole('cell', { name: 'PG/SG' })).toBeInTheDocument()
  expect(within(playerPanel).getByRole('cell', { name: '$5,100' })).toBeInTheDocument()
  expect(within(playerPanel).getByRole('cell', { name: '12.75' })).toBeInTheDocument()
  expect(within(playerPanel).getByRole('cell', { name: '2.5' })).toBeInTheDocument()
})
