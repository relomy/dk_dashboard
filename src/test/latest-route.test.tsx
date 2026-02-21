import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import snapshotFixture from '../../public/mock/snapshots/canonical-live-snapshot.v2.json'
import missingSectionsFixture from '../../public/mock/snapshots/canonical-live-snapshot-missing-sections.json'
import Latest from '../routes/Latest'

vi.mock('../context/ProfileContext', () => ({
  useProfiles: () => ({
    activeProfile: {
      id: 'p1',
      name: 'Alex',
      rules: { contains: 'alex' },
    },
  }),
}))

const latestPayload = {
  latest_snapshot_path: 'snapshots/canonical-live-snapshot.v2.json',
  snapshot_at: '2026-02-13T18:25:00Z',
  generated_at: '2026-02-13T18:25:07Z',
  available_sports: ['nba'],
  manifest_today_path: 'manifest/2026-02-13.json',
}

function firstVipDisplayName(snapshot: any): string | null {
  for (const sport of Object.values(snapshot.sports ?? {})) {
    for (const contest of (sport as any).contests ?? []) {
      const lineup = (contest.vip_lineups ?? [])[0]
      if (lineup?.display_name) {
        return lineup.display_name
      }
    }
  }
  return null
}

afterEach(() => {
  vi.restoreAllMocks()
  cleanup()
})

it('renders latest snapshot summary', async () => {
  const vipName = firstVipDisplayName(snapshotFixture)
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

  fireEvent.change(screen.getByLabelText(/access key/i), { target: { value: 'test-key' } })
  fireEvent.click(screen.getByRole('button', { name: /save key/i }))

  expect((await screen.findAllByText(/last updated:/i)).length).toBeGreaterThan(0)
  if (vipName) {
    expect(screen.getByText(vipName)).toBeInTheDocument()
  }
  expect(screen.getByText(/Field size: 114/i)).toBeInTheDocument()
  expect(screen.getByText(/Max per user: 1/i)).toBeInTheDocument()
  expect(screen.getByText(/Prize pool \$1,000/i)).toBeInTheDocument()
  expect(screen.getAllByText(/Cashed/i).length).toBeGreaterThan(0)
  expect(screen.queryByText(/Entries\s+\d+\s*\/\s*\d+/i)).not.toBeInTheDocument()
  const liveLinks = screen.getAllByRole('link', { name: /live view/i })
  expect(liveLinks.some((link) => link.getAttribute('href') === '/live/nba')).toBe(true)

  fireEvent.change(screen.getByLabelText(/vip filter/i), { target: { value: 'active' } })

  expect(screen.getAllByText(/no matching vip lineups/i).length).toBeGreaterThan(0)
})

it('renders latest route with missing live-only sections fixture', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/latest') || url.includes('/mock/latest.json')) {
        return new Response(
          JSON.stringify({
            ...latestPayload,
            latest_snapshot_path: 'snapshots/canonical-live-snapshot-missing-sections.json',
          }),
          { status: 200 },
        )
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

  fireEvent.change(screen.getByLabelText(/access key/i), { target: { value: 'test-key' } })
  fireEvent.click(screen.getByRole('button', { name: /save key/i }))

  expect((await screen.findAllByText(/last updated:/i)).length).toBeGreaterThan(0)
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

  fireEvent.change(screen.getByLabelText(/access key/i), { target: { value: 'test-key' } })
  fireEvent.click(screen.getByRole('button', { name: /save key/i }))
  expect((await screen.findAllByText(/last updated:/i)).length).toBeGreaterThan(0)

  const beforeRefreshCalls = fetchSpy.mock.calls.length
  fireEvent.click(screen.getByRole('button', { name: /refresh/i }))

  await waitFor(() => {
    expect(fetchSpy.mock.calls.length).toBeGreaterThan(beforeRefreshCalls)
  })
})

it('renders completed VIP cashing with payout amount', async () => {
  const snapshotWithPayout = structuredClone(snapshotFixture) as any
  const contest = snapshotWithPayout.sports.nba.contests[0]
  contest.state = 'completed'
  contest.currency = 'USD'
  contest.vip_lineups[0].payout_cents = 2000
  contest.vip_lineups[0].live = {
    ...(contest.vip_lineups[0].live ?? {}),
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

  fireEvent.change(screen.getByLabelText(/access key/i), { target: { value: 'test-key' } })
  fireEvent.click(screen.getByRole('button', { name: /save key/i }))

  expect((await screen.findAllByText(/last updated:/i)).length).toBeGreaterThan(0)
  expect(screen.getAllByText(/Cashed \$20/i).length).toBeGreaterThan(0)
})
