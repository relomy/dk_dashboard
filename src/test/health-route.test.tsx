import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import snapshotFixture from '../../public/mock/snapshots/live-2026-10-03T20-48-31Z.json'
import Health from '../routes/Health'

afterEach(() => {
  vi.restoreAllMocks()
})

function buildHealthFixture() {
  const snapshot = structuredClone(snapshotFixture) as any
  snapshot.sports.golf.status = 'stale'
  snapshot.sports.golf.error = 'Upstream timeout'
  return snapshot
}

it('shows snapshot age and per-sport status from latest+snapshot', async () => {
  const healthFixture = buildHealthFixture()
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
            available_sports: ['cfb', 'golf', 'mlb'],
            manifest_today_path: 'manifest/2026-10-03.json',
          }),
          { status: 200 },
        )
      }

      return new Response(JSON.stringify(healthFixture), { status: 200 })
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
  expect(screen.getByText(/cfb/i)).toBeInTheDocument()
  expect(screen.getAllByText(/ok/i).length).toBeGreaterThan(0)
  expect(screen.getByText(/golf/i)).toBeInTheDocument()
  expect(screen.getByText(/upstream timeout/i)).toBeInTheDocument()
})
