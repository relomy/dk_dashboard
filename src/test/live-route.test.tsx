import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import snapshotFixture from '../../public/mock/snapshots/canonical-live-snapshot.json'
import emptyStandingsFixture from '../../public/mock/snapshots/canonical-live-snapshot-empty-standings.json'
import missingSectionsFixture from '../../public/mock/snapshots/canonical-live-snapshot-missing-sections.json'
import noPrimaryFixture from '../../public/mock/snapshots/canonical-live-snapshot-no-primary.json'
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
  expect(screen.getByText(/contest key: nba:1001/i)).toBeInTheDocument()
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

  await renderLive(snapshotWithConflictingPointers)
  expect(screen.getByText(/contest key: nba:1001/i)).toBeInTheDocument()
  expect(screen.queryByText(/contest key: nba:1002/i)).not.toBeInTheDocument()
})

it('uses payout_cents as cashing truth for VIP lineups', async () => {
  const snapshotWithConflictingCashingSignals = structuredClone(snapshotFixture) as any
  snapshotWithConflictingCashingSignals.sports.nba.contests[0].vip_lineups[1].live.is_cashing = false

  await renderLive(snapshotWithConflictingCashingSignals)
  expect(screen.getByText(/fallback cash/i)).toBeInTheDocument()
  const fallbackCard = screen.getByText(/fallback cash/i).closest('li')
  if (!fallbackCard) {
    throw new Error('Fallback lineup card not found')
  }
  expect(within(fallbackCard).getByText(/^cashing$/i)).toBeInTheDocument()
})

it('renders VIP and train slot names directly from name-only fields', async () => {
  const snapshotWithUnknownNames = structuredClone(snapshotFixture) as any
  snapshotWithUnknownNames.sports.nba.contests[0].vip_lineups[1].slots[1].player_name = 'Unknown Slot Name'
  snapshotWithUnknownNames.sports.nba.contests[0].train_clusters.clusters[0].composition[1].player_name =
    'Unknown Composition Name'

  await renderLive(snapshotWithUnknownNames)
  expect(screen.getByText(/UTIL: Unknown Slot Name/i)).toBeInTheDocument()
  expect(screen.getByText(/SG: Unknown Composition Name/i)).toBeInTheDocument()
})

it('renders ownership watchlist total and respects top_n_default', async () => {
  const snapshotWithTopN = structuredClone(snapshotFixture) as any
  snapshotWithTopN.sports.nba.contests[0].ownership_watchlist.top_n_default = 1

  await renderLive(snapshotWithTopN)
  expect(screen.getByText(/ownership remaining total:/i)).toBeInTheDocument()
  expect(screen.getByText(/^top 1$/i)).toBeInTheDocument()
  const ownershipPanel = screen.getByRole('heading', { name: /ownership remaining/i }).closest('.panel')
  if (!(ownershipPanel instanceof HTMLElement)) {
    throw new Error('Ownership panel not found')
  }
  const ownershipTable = within(ownershipPanel).getByRole('table')
  expect(within(ownershipTable).getByText(/train head a/i)).toBeInTheDocument()
  expect(within(ownershipTable).queryByText(/train head b/i)).not.toBeInTheDocument()
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
    cluster_key: 'nba-1001-cluster-b',
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
  expect(screen.getByText(/cluster rule: shared_slots \(min shared: 4\)/i)).toBeInTheDocument()

  const clusterTitles = screen.getAllByText(/nba-1001-cluster-/i)
  expect(clusterTitles[0]).toHaveTextContent('nba-1001-cluster-b')
  expect(clusterTitles[1]).toHaveTextContent('nba-1001-cluster-a')
  expect(screen.queryByText(/Sample B4/i)).not.toBeInTheDocument()
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
  snapshotWithMixedPayouts.sports.nba.contests[0].standings.rows[0].payout_cents = undefined

  await renderLive(snapshotWithMixedPayouts)
  const standingsPanel = screen.getByRole('heading', { name: /standings/i }).closest('.panel')
  if (!(standingsPanel instanceof HTMLElement)) {
    throw new Error('Standings panel not found')
  }
  const standingsTable = within(standingsPanel).getByRole('table')
  expect(within(standingsTable).getByText('—')).toBeInTheDocument()
})
