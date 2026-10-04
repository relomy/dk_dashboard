import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import producerSnapshot from '../../public/mock/snapshots/live-2026-10-03T20-48-31Z.json'
import Latest from '../routes/Latest'
import type { Snapshot } from '../lib/types'

vi.mock('../context/ProfileContext', () => ({
  useProfiles: () => ({
    activeProfile: {
      id: 'p1',
      name: 'Alex',
      rules: { contains: 'alex' },
    },
  }),
}))

const VIP_NAME = 'cglenn91'

// The producer fixture carries no VIP lineups, so inject one into the cfb primary contest.
const snapshotFixture = (() => {
  const snapshot = structuredClone(producerSnapshot) as unknown as Snapshot
  snapshot.sports.cfb.contests[0].vip_lineups = [
    {
      entry_key: 'vip-entry-1',
      display_name: VIP_NAME,
      rank: 12,
      points: 140.5,
      payout_cents: 5000,
      slots: [{ slot: 'QB', player_name: 'Ashton Daniels' }],
    },
  ]
  return snapshot
})()

const latestPayload = {
  latest_snapshot_path: 'snapshots/live-2026-10-03T20-48-31Z.json',
  snapshot_at: '2026-10-03T20:48:31Z',
  generated_at: '2026-10-03T20:48:31Z',
  available_sports: ['cfb', 'golf', 'mlb'],
  manifest_today_path: 'manifest/2026-10-03.json',
}

function getRequestedSnapshotPath(url: string): string | null {
  try {
    return new URL(url, 'http://local.test').searchParams.get('path')
  } catch {
    return null
  }
}

function buildMissingSectionsFixture() {
  const snapshot = structuredClone(snapshotFixture) as unknown as Snapshot
  const contest = snapshot.sports.cfb.contests[0]
  delete contest.ownership_watchlist
  delete contest.train_clusters
  delete contest.standings
  return snapshot
}

afterEach(() => {
  vi.restoreAllMocks()
  cleanup()
})

it('renders latest snapshot summary', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/latest') || url.includes('/mock/latest.json')) {
        return new Response(JSON.stringify(latestPayload), { status: 200 })
      }
      return new Response(JSON.stringify(snapshotFixture), { status: 200 })
    }),
  )

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/latest']}>
        <Routes>
          <Route path="/latest" element={<Latest />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )

  expect((await screen.findAllByText(/last updated:/i)).length).toBeGreaterThan(0)
  expect(screen.getByText(VIP_NAME)).toBeInTheDocument()
  expect(screen.getAllByText(/Field size: 229/i).length).toBeGreaterThan(0)
  expect(screen.getAllByText(/Max per user: 1/i).length).toBeGreaterThan(0)
  expect(screen.getByText(/Prize pool \$5,000/i)).toBeInTheDocument()
  expect(screen.getByText('Cashing')).toBeInTheDocument()
  expect(screen.queryByText(/Entries\s+\d+\s*\/\s*\d+/i)).not.toBeInTheDocument()
  const liveLinks = screen.getAllByRole('link', { name: /live view/i })
  expect(liveLinks.some((link) => link.getAttribute('href') === '/live/cfb')).toBe(true)

  fireEvent.change(screen.getByLabelText(/vip filter/i), { target: { value: 'active' } })

  expect(screen.getAllByText(/no matching vip lineups/i).length).toBeGreaterThan(0)
})

it('renders latest route with missing live-only sections fixture', async () => {
  const missingSectionsFixture = buildMissingSectionsFixture()
  let requestedSnapshotPath: string | null = null
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/latest') || url.includes('/mock/latest.json')) {
        return new Response(
          JSON.stringify({
            ...latestPayload,
            latest_snapshot_path: 'snapshots/live-2026-10-03T20-48-31Z-missing-sections.json',
          }),
          { status: 200 },
        )
      }
      requestedSnapshotPath = getRequestedSnapshotPath(url)
      if (requestedSnapshotPath !== 'snapshots/live-2026-10-03T20-48-31Z-missing-sections.json') {
        return new Response(JSON.stringify({ error: 'unexpected snapshot path' }), { status: 404 })
      }
      return new Response(JSON.stringify(missingSectionsFixture), { status: 200 })
    }),
  )

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/latest']}>
        <Routes>
          <Route path="/latest" element={<Latest />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )

  expect((await screen.findAllByText(/last updated:/i)).length).toBeGreaterThan(0)
  expect(requestedSnapshotPath).toBe('snapshots/live-2026-10-03T20-48-31Z-missing-sections.json')
  fireEvent.change(screen.getByLabelText(/vip filter/i), { target: { value: 'active' } })
  expect(screen.getAllByText(/no matching vip lineups/i).length).toBeGreaterThan(0)
})

it('refresh button refetches latest and snapshot', async () => {
  const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/api/latest') || url.includes('/mock/latest.json')) {
      return new Response(JSON.stringify(latestPayload), { status: 200 })
    }
    return new Response(JSON.stringify(snapshotFixture), { status: 200 })
  })
  vi.stubGlobal('fetch', fetchSpy)

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/latest']}>
        <Routes>
          <Route path="/latest" element={<Latest />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  expect((await screen.findAllByText(/last updated:/i)).length).toBeGreaterThan(0)

  const beforeRefreshCalls = fetchSpy.mock.calls.length
  fireEvent.click(screen.getByRole('button', { name: /refresh/i }))

  await waitFor(() => {
    expect(fetchSpy.mock.calls.length).toBeGreaterThan(beforeRefreshCalls)
  })
})

it('renders completed VIP cashing with payout amount', async () => {
  const snapshotWithPayout = structuredClone(snapshotFixture) as unknown as Snapshot
  const contest = snapshotWithPayout.sports.cfb.contests[0]
  contest.state = 'completed'
  contest.currency = 'USD'
  contest.vip_lineups[0].payout_cents = 2000
  contest.vip_lineups[0].live = {
    updated_at: '2026-10-03T20:48:31Z',
    payout_cents: 2000,
  }

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/latest') || url.includes('/mock/latest.json')) {
        return new Response(JSON.stringify(latestPayload), { status: 200 })
      }
      return new Response(JSON.stringify(snapshotWithPayout), { status: 200 })
    }),
  )

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/latest']}>
        <Routes>
          <Route path="/latest" element={<Latest />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )

  expect((await screen.findAllByText(/last updated:/i)).length).toBeGreaterThan(0)
  expect(screen.getAllByText(/Cashed \$20/i).length).toBeGreaterThan(0)
})
