import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import snapshotFixture from '../../public/mock/snapshots/live-2026-10-03T20-48-31Z.json'
import Health from '../routes/Health'
import type { Snapshot } from '../lib/types'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function buildHealthFixture() {
  const snapshot = structuredClone(snapshotFixture) as unknown as Snapshot
  snapshot.sports.golf.status = 'stale'
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
  const details = within(screen.getByRole('table'))
  expect(details.getByText(/cfb/i)).toBeInTheDocument()
  expect(details.getAllByText('Fresh').length).toBeGreaterThan(0)
  expect(details.getByText(/golf/i)).toBeInTheDocument()

  // The stale sport is also called out in the "Needs attention" list.
  const attention = within(screen.getByRole('region', { name: /needs attention/i }))
  expect(attention.getByText(/golf/i)).toBeInTheDocument()
  expect(attention.getByText('Stale')).toBeInTheDocument()
  expect(attention.queryByText(/cfb/i)).not.toBeInTheDocument()
})

function stubUnsupported(version: unknown) {
  const envelope: Record<string, unknown> = { snapshot_at: '2026-10-03T20:48:31Z', generated_at: '2026-10-03T20:48:31Z', sports: {} }
  if (version !== undefined) envelope.schema_version = version
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) =>
      new Response(
        JSON.stringify(
          String(input).includes('/api/latest') ? { latest_snapshot_path: 'snapshots/old.json' } : envelope,
        ),
        { status: 200 },
      ),
    ),
  )
}

function renderHealth() {
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
}

it('shows the shared unsupported message', async () => {
  stubUnsupported(2)
  renderHealth()
  expect(await screen.findByText('Unsupported snapshot schema version: 2.')).toBeInTheDocument()
  expect(screen.queryByText(/snapshot age/i)).not.toBeInTheDocument()
})
