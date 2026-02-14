import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import History from '../routes/History'

vi.mock('../context/ProfileContext', () => ({
  useProfiles: () => ({
    activeProfile: {
      id: 'p1',
      name: 'Me',
      rules: {},
    },
  }),
}))

const snapshotPayload = {
  schema_version: 1,
  snapshot_at: '2026-02-13T18:25:00Z',
  generated_at: '2026-02-13T18:25:07Z',
  sports: {
    nba: {
      status: 'ok',
      updated_at: '2026-02-13T18:25:00Z',
      contests: [],
      players: [],
    },
  },
}

function LocationProbe() {
  const location = useLocation()
  return <p data-testid="location">{location.pathname}</p>
}

afterEach(() => {
  vi.restoreAllMocks()
  cleanup()
})

it('resolves timestamp via UTC day manifest and renders snapshot', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.includes('manifest/2026-02-13.json')) {
        return new Response(
          JSON.stringify({
            manifest_version: 1,
            date_utc: '2026-02-13',
            generated_at: '2026-02-13T23:59:55Z',
            snapshots: [
              {
                snapshot_at: '2026-02-13T18:25:00Z',
                path: 'snapshots/dk-two-sport-bundle-v6.json',
                sports_present: ['nba'],
                contest_counts_by_sport: { nba: 0 },
                state_counts: {},
                sports_status: {
                  nba: { status: 'ok', updated_at: '2026-02-13T18:25:00Z' },
                },
              },
            ],
          }),
          { status: 200 },
        )
      }

      return new Response(JSON.stringify(snapshotPayload), { status: 200 })
    }),
  )

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/history/2026-02-13T18-25-00Z']}>
        <Routes>
          <Route path="/history/:timestamp" element={<History />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )

  fireEvent.change(screen.getByLabelText(/access key/i), { target: { value: 'test-key' } })
  fireEvent.click(screen.getByRole('button', { name: /save key/i }))

  expect(await screen.findByText(/last updated:/i)).toBeInTheDocument()
})

it('shows snapshot not found for missing exact match', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(
        JSON.stringify({
          manifest_version: 1,
          date_utc: '2026-02-13',
          generated_at: '2026-02-13T23:59:55Z',
          snapshots: [
            {
              snapshot_at: '2026-02-13T18:20:00Z',
              path: 'snapshots/2026-02-13T18-20-00Z.json',
              sports_present: ['nba'],
              contest_counts_by_sport: { nba: 0 },
              state_counts: {},
              sports_status: {
                nba: { status: 'ok', updated_at: '2026-02-13T18:20:00Z' },
              },
            },
          ],
        }),
        { status: 200 },
      ),
    ),
  )

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/history/2026-02-13T18-25-00Z']}>
        <Routes>
          <Route path="/history/:timestamp" element={<History />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )

  fireEvent.change(screen.getByLabelText(/access key/i), { target: { value: 'test-key' } })
  fireEvent.click(screen.getByRole('button', { name: /save key/i }))

  expect(await screen.findByText(/snapshot not found/i)).toBeInTheDocument()
})

it('renders timeline list from manifest metadata and navigates on item click', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.includes('/api/latest') || url.includes('/mock/latest.json')) {
        return new Response(
          JSON.stringify({
            latest_snapshot_path: 'snapshots/dk-two-sport-bundle-v6.json',
            snapshot_at: '2026-02-13T18:25:00Z',
            generated_at: '2026-02-13T18:25:07Z',
            available_sports: ['nba', 'nfl'],
            manifest_today_path: 'manifest/2026-02-13.json',
            manifest_yesterday_path: 'manifest/2026-02-12.json',
          }),
          { status: 200 },
        )
      }

      if (url.includes('manifest/2026-02-13.json')) {
        return new Response(
          JSON.stringify({
            manifest_version: 1,
            date_utc: '2026-02-13',
            generated_at: '2026-02-13T23:59:55Z',
            snapshots: [
              {
                snapshot_at: '2026-02-13T18:25:00Z',
                path: 'snapshots/dk-two-sport-bundle-v6.json',
                sports_present: ['nba', 'nfl'],
                contest_counts_by_sport: { nba: 2, nfl: 1 },
                state_counts: { live: 1, upcoming: 1 },
                sports_status: {
                  nba: { status: 'ok', updated_at: '2026-02-13T18:25:00Z' },
                  nfl: { status: 'stale', updated_at: '2026-02-13T18:20:00Z' },
                },
              },
              {
                snapshot_at: '2026-02-13T18:20:00Z',
                path: 'snapshots/2026-02-13T18-20-00Z.json',
                sports_present: ['nba'],
                contest_counts_by_sport: { nba: 1 },
                state_counts: { completed: 1 },
                sports_status: {
                  nba: { status: 'ok', updated_at: '2026-02-13T18:20:00Z' },
                },
              },
            ],
          }),
          { status: 200 },
        )
      }

      if (url.includes('manifest/2026-02-12.json')) {
        return new Response(
          JSON.stringify({
            manifest_version: 1,
            date_utc: '2026-02-12',
            generated_at: '2026-02-12T23:59:55Z',
            snapshots: [
              {
                snapshot_at: '2026-02-12T23:55:00Z',
                path: 'snapshots/2026-02-12T23-55-00Z.json',
                sports_present: ['nfl'],
                contest_counts_by_sport: { nfl: 3 },
                state_counts: { live: 2 },
                sports_status: {
                  nfl: { status: 'error', updated_at: '2026-02-12T23:50:00Z', error: 'bad feed' },
                },
              },
            ],
          }),
          { status: 200 },
        )
      }

      return new Response(JSON.stringify(snapshotPayload), { status: 200 })
    }),
  )

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/history']}>
        <Routes>
          <Route path="/history" element={<History />} />
          <Route path="/history/:timestamp" element={<History />} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  )

  fireEvent.change(screen.getByLabelText(/access key/i), { target: { value: 'test-key' } })
  fireEvent.click(screen.getByRole('button', { name: /save key/i }))

  expect(await screen.findByRole('heading', { name: /history/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /load yesterday/i })).toBeInTheDocument()
  expect(screen.getByText(/sports: nba, nfl/i)).toBeInTheDocument()

  const list = screen.getByRole('list')
  expect(within(list).getAllByRole('listitem')).toHaveLength(2)

  fireEvent.change(screen.getByLabelText(/sport filter/i), { target: { value: 'nfl' } })
  expect(within(list).getAllByRole('listitem')).toHaveLength(1)

  fireEvent.change(screen.getByLabelText(/sport filter/i), { target: { value: 'all' } })
  fireEvent.change(screen.getByLabelText(/state filter/i), { target: { value: 'live' } })
  expect(within(list).getAllByRole('listitem')).toHaveLength(1)

  fireEvent.change(screen.getByLabelText(/state filter/i), { target: { value: 'all' } })
  fireEvent.click(screen.getByRole('button', { name: /load yesterday/i }))
  expect(await screen.findByText(/sports: nfl/i)).toBeInTheDocument()

  const firstItemButton = within(list).getAllByRole('button')[0]
  fireEvent.click(firstItemButton)

  expect(screen.getByTestId('location')).toHaveTextContent('/history/2026-02-13T18-25-00Z')
})
