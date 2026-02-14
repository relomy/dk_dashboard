import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
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
  latest_snapshot_path: 'snapshots/dk-two-sport-bundle-v6.json',
  snapshot_at: '2026-02-13T18:25:00Z',
  generated_at: '2026-02-13T18:25:07Z',
  available_sports: ['nba'],
  manifest_today_path: 'manifest/2026-02-13.json',
}

const snapshotPayload = {
  schema_version: 1,
  snapshot_at: '2026-02-13T18:25:00Z',
  generated_at: '2026-02-13T18:25:07Z',
  sports: {
    nba: {
      status: 'ok',
      updated_at: '2026-02-13T18:25:00Z',
      contests: [
        {
          contest_id: 'c1',
          contest_key: 'nba:c1',
          name: 'NBA Contest',
          sport: 'nba',
          contest_type: 'classic',
          start_time: '2026-02-13T18:00:00Z',
          state: 'live',
          entry_fee_cents: 1000,
          prize_pool_cents: 20000,
          currency: 'USD',
          entries_count: 100,
          max_entries: 100,
          vip_lineups: [
            { vip_entry_key: 'v1', display_name: 'Alex Core', slots: [] },
            { vip_entry_key: 'v2', display_name: 'Jamie SD', slots: [] },
          ],
        },
      ],
      players: [],
    },
  },
}

afterEach(() => {
  vi.restoreAllMocks()
})

it('renders latest snapshot summary', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/latest') || url.includes('/mock/latest.json')) {
        return new Response(JSON.stringify(latestPayload), { status: 200 })
      }
      return new Response(JSON.stringify(snapshotPayload), { status: 200 })
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

  expect(await screen.findByText(/last updated:/i)).toBeInTheDocument()
  expect(screen.getByText('Alex Core')).toBeInTheDocument()
  expect(screen.getByText('Jamie SD')).toBeInTheDocument()

  fireEvent.change(screen.getByLabelText(/vip filter/i), { target: { value: 'active' } })

  expect(screen.getByText('Alex Core')).toBeInTheDocument()
  expect(screen.queryByText('Jamie SD')).not.toBeInTheDocument()
})
