import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import Health from '../routes/Health'

afterEach(() => {
  vi.restoreAllMocks()
})

it('shows snapshot age and per-sport status from latest+snapshot', async () => {
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

      return new Response(
        JSON.stringify({
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
            nfl: {
              status: 'error',
              updated_at: '2026-02-13T18:20:00Z',
              error: 'Upstream timeout',
              contests: [],
              players: [],
            },
          },
        }),
        { status: 200 },
      )
    }),
  )

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/health']}>
        <Routes>
          <Route path="/health" element={<Health />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )

  fireEvent.change(screen.getByLabelText(/access key/i), { target: { value: 'test-key' } })
  fireEvent.click(screen.getByRole('button', { name: /save key/i }))

  expect(await screen.findByText(/snapshot age/i)).toBeInTheDocument()
  expect(screen.getByText(/seconds/i)).toBeInTheDocument()
  expect(screen.getByText(/nba/i)).toBeInTheDocument()
  expect(screen.getByText(/ok/i)).toBeInTheDocument()
  expect(screen.getByText(/nfl/i)).toBeInTheDocument()
  expect(screen.getByText(/upstream timeout/i)).toBeInTheDocument()
})
