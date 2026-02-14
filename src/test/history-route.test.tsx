import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
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

afterEach(() => {
  vi.restoreAllMocks()
})

it('resolves timestamp via UTC day manifest and renders snapshot', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.includes('path=manifest%2F2026-02-13.json')) {
        return new Response(
          JSON.stringify({
            manifest_version: 1,
            date_utc: '2026-02-13',
            generated_at: '2026-02-13T23:59:55Z',
            snapshots: [
              {
                snapshot_at: '2026-02-13T18:25:00Z',
                path: 'snapshots/2026-02-13T18-25-00Z.json',
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
