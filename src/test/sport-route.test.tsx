import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import producerSnapshot from '../../public/mock/snapshots/live-2026-10-03T20-48-31Z.json'
import Sport from '../routes/Sport'

vi.mock('../context/ProfileContext', () => ({
  useProfiles: () => ({
    activeProfile: {
      id: 'p1',
      name: 'Alex',
      rules: { contains: 'alex' },
    },
  }),
}))

afterEach(() => {
  vi.restoreAllMocks()
  cleanup()
})

const VIP_NAME = 'cglenn91'

// The producer fixture carries no VIP lineups, so inject one into the cfb primary contest.
const snapshotFixture = (() => {
  const snapshot = structuredClone(producerSnapshot) as any
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

function buildNoPrimaryFixture() {
  const snapshot = structuredClone(snapshotFixture) as any
  delete snapshot.sports.cfb.primary_contest
  snapshot.sports.cfb.contests.forEach((contest: any) => {
    contest.is_primary = false
    contest.state = 'live'
  })
  return snapshot
}

it('uses cached snapshot and renders grouped contests plus player table behavior', async () => {
    const fetchSpy = vi.fn()
  vi.stubGlobal('fetch', fetchSpy)

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData(['snapshot', 'cached.json'], snapshotFixture)

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/sport/cfb']}>
        <Routes>
          <Route path="/sport/:sport" element={<Sport />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )

  expect(await screen.findByRole('heading', { name: /sport: cfb/i })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /open live sweat view/i })).toHaveAttribute('href', '/live/cfb')
  expect(screen.getByRole('heading', { name: /live \(1\)/i })).toBeInTheDocument()
  expect(screen.getByText(/Field size: 229/i)).toBeInTheDocument()
  expect(screen.getByText(/Max per user: 1/i)).toBeInTheDocument()
  expect(screen.getByText(/Prize pool: \$5,000/i)).toBeInTheDocument()
  expect(screen.getByText('Cashing')).toBeInTheDocument()
  expect(screen.queryByText(/Entries:\s*\d+\s*\/\s*\d+/i)).not.toBeInTheDocument()
  expect(screen.getByText(VIP_NAME)).toBeInTheDocument()

  fireEvent.change(screen.getByLabelText(/vip filter/i), { target: { value: 'active' } })
  expect(screen.getByText(/no matching vip lineups/i)).toBeInTheDocument()

  expect(screen.getByRole('heading', { name: /player pool/i })).toBeInTheDocument()

  fireEvent.change(screen.getByLabelText(/search players/i), { target: { value: 'Ashton' } })
  expect(screen.getByRole('cell', { name: /Ashton Daniels/i })).toBeInTheDocument()

  expect(fetchSpy).not.toHaveBeenCalled()
})

it('loads latest snapshot when cache is empty', async () => {
  const availableSport = 'mlb'

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/latest') || url.includes('/mock/latest.json')) {
        return new Response(
          JSON.stringify({
            latest_snapshot_path: 'snapshots/live-2026-10-03T20-48-31Z.json',
            snapshot_at: '2026-10-03T20:48:31Z',
            generated_at: '2026-10-03T20:48:31Z',
            available_sports: ['cfb', availableSport],
            manifest_today_path: 'manifest/2026-10-03.json',
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
      <MemoryRouter initialEntries={[`/sport/${availableSport}`]}>
        <Routes>
          <Route path="/sport/:sport" element={<Sport />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )

  expect(await screen.findByRole('heading', { name: new RegExp(`sport: ${availableSport}`, 'i') })).toBeInTheDocument()
  expect(await screen.findByRole('heading', { name: /live \(1\)/i })).toBeInTheDocument()
})

it('does not use history snapshot cache for sport route data', async () => {
  const latestSnapshot = structuredClone(snapshotFixture) as any
  const historySnapshot = structuredClone(snapshotFixture) as any
  historySnapshot.sports = {}

  const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/api/latest') || url.includes('/mock/latest.json')) {
      return new Response(
        JSON.stringify({
          latest_snapshot_path: 'snapshots/live-2026-10-03T20-48-31Z.json',
          snapshot_at: '2026-10-03T20:48:31Z',
          generated_at: '2026-10-03T20:48:31Z',
          available_sports: ['cfb'],
          manifest_today_path: 'manifest/2026-10-03.json',
        }),
        { status: 200 },
      )
    }
    return new Response(JSON.stringify(latestSnapshot), { status: 200 })
  })

  vi.stubGlobal('fetch', fetchSpy)

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData(['history-snapshot', 'old-snapshot.json'], historySnapshot)

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/sport/cfb']}>
        <Routes>
          <Route path="/sport/:sport" element={<Sport />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )

  expect(await screen.findByRole('heading', { name: /sport: cfb/i })).toBeInTheDocument()
  expect(screen.queryByText(/sport not found in snapshot/i)).not.toBeInTheDocument()
  expect(fetchSpy).toHaveBeenCalled()
})

it('renders sport route even when primary contest config is missing (live-only contract)', async () => {
  const fetchSpy = vi.fn()
  vi.stubGlobal('fetch', fetchSpy)

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData(['snapshot', 'cached.json'], buildNoPrimaryFixture())

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/sport/cfb']}>
        <Routes>
          <Route path="/sport/:sport" element={<Sport />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )

  expect(await screen.findByRole('heading', { name: /sport: cfb/i })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: /live \(1\)/i })).toBeInTheDocument()
  expect(fetchSpy).not.toHaveBeenCalled()
})

it('renders completed VIP cashing with payout amount', async () => {
  const snapshotWithPayout = structuredClone(snapshotFixture) as any
  const contest = snapshotWithPayout.sports.cfb.contests[0]
  contest.state = 'completed'
  contest.currency = 'USD'
  contest.vip_lineups[0].payout_cents = 2000
  contest.vip_lineups[0].live = {
    ...(contest.vip_lineups[0].live ?? {}),
    payout_cents: 2000,
  }

  const fetchSpy = vi.fn()
  vi.stubGlobal('fetch', fetchSpy)

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData(['snapshot', 'cached.json'], snapshotWithPayout)

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/sport/cfb']}>
        <Routes>
          <Route path="/sport/:sport" element={<Sport />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )

  expect(await screen.findByRole('heading', { name: /sport: cfb/i })).toBeInTheDocument()
  expect(screen.getAllByText(/Cashed \$20/i).length).toBeGreaterThan(0)
  expect(fetchSpy).not.toHaveBeenCalled()
})

it('does not fallback to legacy entry_fee dollars when entry_fee_cents is missing', async () => {
  const snapshotWithLegacyMoneyOnly = structuredClone(snapshotFixture) as any
  const contest = snapshotWithLegacyMoneyOnly.sports.cfb.contests[0]
  contest.entry_fee = 25
  delete contest.entry_fee_cents

  const fetchSpy = vi.fn()
  vi.stubGlobal('fetch', fetchSpy)

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData(['snapshot', 'cached.json'], snapshotWithLegacyMoneyOnly)

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/sport/cfb']}>
        <Routes>
          <Route path="/sport/:sport" element={<Sport />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )

  expect(await screen.findByRole('heading', { name: /sport: cfb/i })).toBeInTheDocument()
  expect(screen.queryByText('$25')).not.toBeInTheDocument()
  expect(fetchSpy).not.toHaveBeenCalled()
})
