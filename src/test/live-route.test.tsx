import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import snapshotFixture from '../../public/mock/snapshots/2026-02-13T18-25-00Z.json'
import Live from '../routes/Live'

afterEach(() => {
  vi.restoreAllMocks()
  cleanup()
})

it('resolves and renders the selected primary contest for live route', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.includes('/api/latest') || url.includes('/mock/latest.json')) {
        return new Response(
          JSON.stringify({
            latest_snapshot_path: 'snapshots/2026-02-13T18-25-00Z.json',
            snapshot_at: '2026-02-13T18:25:00Z',
            generated_at: '2026-02-13T18:25:07Z',
            available_sports: ['nba', 'nfl'],
            manifest_today_path: 'manifest/2026-02-13.json',
          }),
          { status: 200 },
        )
      }

      return new Response(JSON.stringify(snapshotFixture), { status: 200 })
    }),
  )

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

  expect(await screen.findByRole('heading', { name: /live: nba/i })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: /primary contest/i })).toBeInTheDocument()
  expect(screen.getByText(/contest key: nba:1001/i)).toBeInTheDocument()
  expect(screen.getByText(/alex core/i)).toBeInTheDocument()
  expect(screen.queryByText(/jamie sd/i)).not.toBeInTheDocument()
  expect(screen.getByText(/selection reason:/i)).toBeInTheDocument()
})

it('shows explicit state when primary contest is not configured', async () => {
  const snapshotWithoutPrimary = structuredClone(snapshotFixture) as any
  snapshotWithoutPrimary.sports.nba.primary_contest = undefined

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.includes('/api/latest') || url.includes('/mock/latest.json')) {
        return new Response(
          JSON.stringify({
            latest_snapshot_path: 'snapshots/2026-02-13T18-25-00Z.json',
            snapshot_at: '2026-02-13T18:25:00Z',
            generated_at: '2026-02-13T18:25:07Z',
            available_sports: ['nba', 'nfl'],
            manifest_today_path: 'manifest/2026-02-13.json',
          }),
          { status: 200 },
        )
      }

      return new Response(JSON.stringify(snapshotWithoutPrimary), { status: 200 })
    }),
  )

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

  expect(await screen.findByRole('heading', { name: /live: nba/i })).toBeInTheDocument()
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

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.includes('/api/latest') || url.includes('/mock/latest.json')) {
        return new Response(
          JSON.stringify({
            latest_snapshot_path: 'snapshots/2026-02-13T18-25-00Z.json',
            snapshot_at: '2026-02-13T18:25:00Z',
            generated_at: '2026-02-13T18:25:07Z',
            available_sports: ['nba', 'nfl'],
            manifest_today_path: 'manifest/2026-02-13.json',
          }),
          { status: 200 },
        )
      }

      return new Response(JSON.stringify(snapshotWithConflictingPointers), { status: 200 })
    }),
  )

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

  expect(await screen.findByRole('heading', { name: /live: nba/i })).toBeInTheDocument()
  expect(screen.getByText(/contest key: nba:1001/i)).toBeInTheDocument()
  expect(screen.queryByText(/contest key: nba:1002/i)).not.toBeInTheDocument()
})

it('uses cashing fallback from payout and preserves slot order with player-name fallback', async () => {
  const snapshotWithUnknownSlotPlayer = structuredClone(snapshotFixture) as any
  snapshotWithUnknownSlotPlayer.sports.nba.contests[0].vip_lineups[1].slots[1].player_id = 'nba-p999'

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.includes('/api/latest') || url.includes('/mock/latest.json')) {
        return new Response(
          JSON.stringify({
            latest_snapshot_path: 'snapshots/2026-02-13T18-25-00Z.json',
            snapshot_at: '2026-02-13T18:25:00Z',
            generated_at: '2026-02-13T18:25:07Z',
            available_sports: ['nba', 'nfl'],
            manifest_today_path: 'manifest/2026-02-13.json',
          }),
          { status: 200 },
        )
      }

      return new Response(JSON.stringify(snapshotWithUnknownSlotPlayer), { status: 200 })
    }),
  )

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

  expect(await screen.findByRole('heading', { name: /live: nba/i })).toBeInTheDocument()
  expect(screen.getByText(/fallback cash/i)).toBeInTheDocument()
  expect(screen.getAllByText(/cashing/i).length).toBeGreaterThan(0)
  expect(screen.getByText(/cash-line delta: —/i)).toBeInTheDocument()

  const fallbackCard = screen.getByText(/fallback cash/i).closest('li')
  if (!fallbackCard) {
    throw new Error('Fallback lineup card not found')
  }

  const slotItems = within(fallbackCard).getAllByRole('listitem')
  expect(slotItems[0]).toHaveTextContent('PG: Guard One')
  expect(slotItems[1]).toHaveTextContent('UTIL: nba-p999')
})

it('renders ownership watchlist total and respects top_n_default', async () => {
  const snapshotWithTopN = structuredClone(snapshotFixture) as any
  snapshotWithTopN.sports.nba.contests[0].ownership_watchlist.top_n_default = 1

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.includes('/api/latest') || url.includes('/mock/latest.json')) {
        return new Response(
          JSON.stringify({
            latest_snapshot_path: 'snapshots/2026-02-13T18-25-00Z.json',
            snapshot_at: '2026-02-13T18:25:00Z',
            generated_at: '2026-02-13T18:25:07Z',
            available_sports: ['nba', 'nfl'],
            manifest_today_path: 'manifest/2026-02-13.json',
          }),
          { status: 200 },
        )
      }

      return new Response(JSON.stringify(snapshotWithTopN), { status: 200 })
    }),
  )

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

  expect(await screen.findByRole('heading', { name: /live: nba/i })).toBeInTheDocument()
  expect(screen.getByText(/ownership remaining total: 62.5%/i)).toBeInTheDocument()
  expect(screen.getByText(/^top 1$/i)).toBeInTheDocument()
  const ownershipPanel = screen.getByRole('heading', { name: /ownership remaining/i }).closest('.panel')
  if (!(ownershipPanel instanceof HTMLElement)) {
    throw new Error('Ownership panel not found')
  }
  const ownershipTable = within(ownershipPanel).getByRole('table')
  expect(within(ownershipTable).getByText(/train head a/i)).toBeInTheDocument()
  expect(within(ownershipTable).queryByText(/train head b/i)).not.toBeInTheDocument()
})

it('shows ownership placeholder when watchlist is missing', async () => {
  const snapshotWithoutWatchlist = structuredClone(snapshotFixture) as any
  delete snapshotWithoutWatchlist.sports.nba.contests[0].ownership_watchlist

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.includes('/api/latest') || url.includes('/mock/latest.json')) {
        return new Response(
          JSON.stringify({
            latest_snapshot_path: 'snapshots/2026-02-13T18-25-00Z.json',
            snapshot_at: '2026-02-13T18:25:00Z',
            generated_at: '2026-02-13T18:25:07Z',
            available_sports: ['nba', 'nfl'],
            manifest_today_path: 'manifest/2026-02-13.json',
          }),
          { status: 200 },
        )
      }

      return new Response(JSON.stringify(snapshotWithoutWatchlist), { status: 200 })
    }),
  )

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

  expect(await screen.findByRole('heading', { name: /live: nba/i })).toBeInTheDocument()
  expect(screen.getByText(/ownership watchlist unavailable for this contest/i)).toBeInTheDocument()
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
      { slot: 'PG', player_id: 'nba-p1' },
      { slot: 'SG', player_id: 'nba-p2' },
    ],
    sample_entries: [
      { entry_key: 'entry-b-1', display_name: 'Sample B1' },
      { entry_key: 'entry-b-2', display_name: 'Sample B2' },
      { entry_key: 'entry-b-3', display_name: 'Sample B3' },
      { entry_key: 'entry-b-4', display_name: 'Sample B4' },
    ],
  })

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.includes('/api/latest') || url.includes('/mock/latest.json')) {
        return new Response(
          JSON.stringify({
            latest_snapshot_path: 'snapshots/2026-02-13T18-25-00Z.json',
            snapshot_at: '2026-02-13T18:25:00Z',
            generated_at: '2026-02-13T18:25:07Z',
            available_sports: ['nba', 'nfl'],
            manifest_today_path: 'manifest/2026-02-13.json',
          }),
          { status: 200 },
        )
      }

      return new Response(JSON.stringify(snapshotWithSortedClusters), { status: 200 })
    }),
  )

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

  expect(await screen.findByRole('heading', { name: /live: nba/i })).toBeInTheDocument()
  expect(screen.getByText(/cluster rule: shared_slots \(min shared: 4\)/i)).toBeInTheDocument()

  const clusterTitles = screen.getAllByText(/nba-1001-cluster-/i)
  expect(clusterTitles[0]).toHaveTextContent('nba-1001-cluster-b')
  expect(clusterTitles[1]).toHaveTextContent('nba-1001-cluster-a')
  expect(screen.queryByText(/Sample B4/i)).not.toBeInTheDocument()
})

it('preserves composition slot order and joins player names with fallback', async () => {
  const snapshotWithUnknownCompositionPlayer = structuredClone(snapshotFixture) as any
  snapshotWithUnknownCompositionPlayer.sports.nba.contests[0].train_clusters.clusters[0].composition[1].player_id =
    'nba-p999'

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.includes('/api/latest') || url.includes('/mock/latest.json')) {
        return new Response(
          JSON.stringify({
            latest_snapshot_path: 'snapshots/2026-02-13T18-25-00Z.json',
            snapshot_at: '2026-02-13T18:25:00Z',
            generated_at: '2026-02-13T18:25:07Z',
            available_sports: ['nba', 'nfl'],
            manifest_today_path: 'manifest/2026-02-13.json',
          }),
          { status: 200 },
        )
      }

      return new Response(JSON.stringify(snapshotWithUnknownCompositionPlayer), { status: 200 })
    }),
  )

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

  expect(await screen.findByRole('heading', { name: /live: nba/i })).toBeInTheDocument()
  const clusterCard = screen.getByText('nba-1001-cluster-a').closest('li')
  if (!clusterCard) {
    throw new Error('Cluster card not found')
  }

  const compositionItems = within(clusterCard).getAllByRole('listitem').slice(0, 4)
  expect(compositionItems[0]).toHaveTextContent('PG: Guard One')
  expect(compositionItems[1]).toHaveTextContent('SG: nba-p999')
  expect(compositionItems[2]).toHaveTextContent('SF: Forward One')
  expect(compositionItems[3]).toHaveTextContent('PF: Forward Two')
})

it('shows train finder placeholder when train clusters are missing', async () => {
  const snapshotWithoutTrainClusters = structuredClone(snapshotFixture) as any
  delete snapshotWithoutTrainClusters.sports.nba.contests[0].train_clusters

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.includes('/api/latest') || url.includes('/mock/latest.json')) {
        return new Response(
          JSON.stringify({
            latest_snapshot_path: 'snapshots/2026-02-13T18-25-00Z.json',
            snapshot_at: '2026-02-13T18:25:00Z',
            generated_at: '2026-02-13T18:25:07Z',
            available_sports: ['nba', 'nfl'],
            manifest_today_path: 'manifest/2026-02-13.json',
          }),
          { status: 200 },
        )
      }

      return new Response(JSON.stringify(snapshotWithoutTrainClusters), { status: 200 })
    }),
  )

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

  expect(await screen.findByRole('heading', { name: /live: nba/i })).toBeInTheDocument()
  expect(screen.getByText(/train cluster data unavailable for this contest/i)).toBeInTheDocument()
})

it('renders standings table when standings data is present', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.includes('/api/latest') || url.includes('/mock/latest.json')) {
        return new Response(
          JSON.stringify({
            latest_snapshot_path: 'snapshots/2026-02-13T18-25-00Z.json',
            snapshot_at: '2026-02-13T18:25:00Z',
            generated_at: '2026-02-13T18:25:07Z',
            available_sports: ['nba', 'nfl'],
            manifest_today_path: 'manifest/2026-02-13.json',
          }),
          { status: 200 },
        )
      }

      return new Response(JSON.stringify(snapshotFixture), { status: 200 })
    }),
  )

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

  expect(await screen.findByRole('heading', { name: /live: nba/i })).toBeInTheDocument()
  const standingsPanel = screen.getByRole('heading', { name: /standings/i }).closest('.panel')
  if (!(standingsPanel instanceof HTMLElement)) {
    throw new Error('Standings panel not found')
  }
  expect(within(standingsPanel).getByText(/updated:/i)).toBeInTheDocument()
  expect(within(standingsPanel).getByText(/rows: 2/i)).toBeInTheDocument()
  const standingsTable = within(standingsPanel).getByRole('table')
  expect(within(standingsTable).getByText(/train head a/i)).toBeInTheDocument()
})

it('shows standings placeholder when standings data is missing', async () => {
  const snapshotWithoutStandings = structuredClone(snapshotFixture) as any
  delete snapshotWithoutStandings.sports.nba.contests[0].standings

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.includes('/api/latest') || url.includes('/mock/latest.json')) {
        return new Response(
          JSON.stringify({
            latest_snapshot_path: 'snapshots/2026-02-13T18-25-00Z.json',
            snapshot_at: '2026-02-13T18:25:00Z',
            generated_at: '2026-02-13T18:25:07Z',
            available_sports: ['nba', 'nfl'],
            manifest_today_path: 'manifest/2026-02-13.json',
          }),
          { status: 200 },
        )
      }

      return new Response(JSON.stringify(snapshotWithoutStandings), { status: 200 })
    }),
  )

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

  expect(await screen.findByRole('heading', { name: /live: nba/i })).toBeInTheDocument()
  expect(screen.getByText(/standings unavailable for this contest/i)).toBeInTheDocument()
})
