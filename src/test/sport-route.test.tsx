import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import snapshotFixture from '../../public/mock/snapshots/canonical-live-snapshot.json'
import noPrimaryFixture from '../../public/mock/snapshots/canonical-live-snapshot-no-primary.json'
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

function firstVipNameForSport(snapshot: any, sport: string): string | null {
  const contests = snapshot?.sports?.[sport]?.contests ?? []
  for (const contest of contests) {
    const lineup = (contest.vip_lineups ?? [])[0]
    if (lineup?.display_name) {
      return lineup.display_name
    }
  }
  return null
}

it('uses cached snapshot and renders grouped contests plus player table behavior', async () => {
  const vipName = firstVipNameForSport(snapshotFixture, 'nba')
  const fetchSpy = vi.fn()
  vi.stubGlobal('fetch', fetchSpy)

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData(['snapshot', 'cached.json'], snapshotFixture)

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/sport/nba']}>
        <Routes>
          <Route path="/sport/:sport" element={<Sport />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )

  expect(await screen.findByRole('heading', { name: /sport: nba/i })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /open live sweat view/i })).toHaveAttribute('href', '/live/nba')
  expect(screen.getByRole('heading', { name: /unknown/i })).toBeInTheDocument()
  if (vipName) {
    expect(screen.getByText(vipName)).toBeInTheDocument()
  }

  fireEvent.change(screen.getByLabelText(/vip filter/i), { target: { value: 'active' } })
  expect(screen.getByText(/no matching vip lineups/i)).toBeInTheDocument()

  expect(screen.getByRole('heading', { name: /player pool/i })).toBeInTheDocument()

  fireEvent.change(screen.getByLabelText(/search players/i), { target: { value: 'LeBron' } })
  expect(screen.getByRole('cell', { name: /LeBron James/i })).toBeInTheDocument()

  expect(fetchSpy).not.toHaveBeenCalled()
})

it('loads latest snapshot when cache is empty', async () => {
  const availableSport = Object.keys(snapshotFixture.sports).find((key) => key !== 'nba') ?? 'nba'

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/latest') || url.includes('/mock/latest.json')) {
        return new Response(
          JSON.stringify({
            latest_snapshot_path: 'snapshots/canonical-live-snapshot.json',
            snapshot_at: '2026-02-13T18:25:00Z',
            generated_at: '2026-02-13T18:25:07Z',
            available_sports: ['nba', availableSport],
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
      <MemoryRouter initialEntries={[`/sport/${availableSport}`]}>
        <Routes>
          <Route path="/sport/:sport" element={<Sport />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )

  fireEvent.change(screen.getByLabelText(/access key/i), { target: { value: 'test-key' } })
  fireEvent.click(screen.getByRole('button', { name: /save key/i }))

  expect(await screen.findByRole('heading', { name: new RegExp(`sport: ${availableSport}`, 'i') })).toBeInTheDocument()
  expect(await screen.findByRole('heading', { name: /unknown/i })).toBeInTheDocument()
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
          latest_snapshot_path: 'snapshots/canonical-live-snapshot.json',
          snapshot_at: '2026-02-13T18:25:00Z',
          generated_at: '2026-02-13T18:25:07Z',
          available_sports: ['nba'],
          manifest_today_path: 'manifest/2026-02-13.json',
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
      <MemoryRouter initialEntries={['/sport/nba']}>
        <Routes>
          <Route path="/sport/:sport" element={<Sport />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )

  fireEvent.change(screen.getByLabelText(/access key/i), { target: { value: 'test-key' } })
  fireEvent.click(screen.getByRole('button', { name: /save key/i }))

  expect(await screen.findByRole('heading', { name: /sport: nba/i })).toBeInTheDocument()
  expect(screen.queryByText(/sport not found in snapshot/i)).not.toBeInTheDocument()
  expect(fetchSpy).toHaveBeenCalled()
})

it('renders sport route even when primary contest config is missing (live-only contract)', async () => {
  const fetchSpy = vi.fn()
  vi.stubGlobal('fetch', fetchSpy)

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData(['snapshot', 'cached.json'], noPrimaryFixture)

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/sport/nba']}>
        <Routes>
          <Route path="/sport/:sport" element={<Sport />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )

  expect(await screen.findByRole('heading', { name: /sport: nba/i })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: /live \(1\)/i })).toBeInTheDocument()
  expect(fetchSpy).not.toHaveBeenCalled()
})
