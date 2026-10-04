import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
// Exported by the dk_results producer; provenance in public/mock/PRODUCER_FIXTURE.md.
import producerManifest from '../../public/mock/manifest/2026-10-03.json'
import History from '../routes/History'

vi.mock('../context/ProfileContext', () => ({
  useProfiles: () => ({ activeProfile: { id: 'p1', name: 'Me', rules: {} } }),
}))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  cleanup()
})

it('shows each sport with its Status and no stray separator in the History timeline', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/latest') || url.includes('/mock/latest.json')) {
        return new Response(
          JSON.stringify({
            available_sports: ['cfb', 'golf', 'mlb'],
            generated_at: '2026-10-03T20:48:31Z',
            latest_snapshot_path: 'snapshots/live-2026-10-03T20-48-31Z.json',
            manifest_today_path: 'manifest/2026-10-03.json',
            snapshot_at: '2026-10-03T20:48:31Z',
          }),
          { status: 200 },
        )
      }
      return new Response(JSON.stringify(producerManifest), { status: 200 })
    }),
  )

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/history']}>
        <Routes>
          <Route path="/history" element={<History />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )

  await screen.findAllByText(/contest counts/i)
  const statuses = screen.getAllByText(/^(Fresh|Stale|Error)$/)
  expect(statuses.length).toBe(producerManifest.snapshots.length * 3)
  for (const status of statuses) {
    expect(status.parentElement?.textContent).toMatch(/^(cfb|golf|mlb): (Fresh|Stale|Error)$/)
  }
})
