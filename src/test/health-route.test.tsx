import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import missingSectionsFixture from '../../public/mock/snapshots/canonical-live-snapshot-missing-sections.json'
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
            latest_snapshot_path: 'snapshots/canonical-live-snapshot.v2.json',
            snapshot_at: '2026-02-13T18:25:00Z',
            generated_at: '2026-02-13T18:25:07Z',
            available_sports: ['nba', 'nfl'],
            manifest_today_path: 'manifest/2026-02-13.json',
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
      <MemoryRouter initialEntries={['/health']}>
        <Routes>
          <Route path="/health" element={<Health />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )

  expect(await screen.findByText(/snapshot age/i)).toBeInTheDocument()
  expect(screen.getByText(/seconds/i)).toBeInTheDocument()
  expect(screen.getByText(/nba/i)).toBeInTheDocument()
  expect(screen.getByText(/ok/i)).toBeInTheDocument()
  expect(screen.getByText(/nfl/i)).toBeInTheDocument()
  expect(screen.getByText(/upstream timeout/i)).toBeInTheDocument()
})
