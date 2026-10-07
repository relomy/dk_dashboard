import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
// Exported by the dk_results producer; provenance in public/mock/PRODUCER_FIXTURE.md.
import producerManifest from '../../public/mock/manifest/2026-10-03.json'
import historicalSnapshot from '../../public/mock/snapshots/live-2026-10-04T18-41-34Z.json'
import History from '../routes/History'

vi.mock('../context/ProfileContext', () => ({
  useProfiles: () => ({ activeProfile: { id: 'p1', name: 'Me', rules: {} } }),
}))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  cleanup()
})

it('keeps an unsupported historical version distinct from a fetching error', async () => {
  const snapshot = { ...historicalSnapshot, schema_version: 2 }
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const manifest = { snapshots: [{ snapshot_at: historicalSnapshot.snapshot_at, path: 'snapshots/historical.json' }] }
    return new Response(JSON.stringify(String(input).includes('manifest') ? manifest : snapshot), { status: 200 })
  }))
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={['/history/2026-10-04T18-41-34Z']}><Routes><Route path="/history/:timestamp" element={<History />} /></Routes></MemoryRouter></QueryClientProvider>)
  expect(await screen.findByText('Unsupported snapshot schema version: 2.')).toBeInTheDocument()
})

async function renderHistorical(snapshot: unknown) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const manifest = { snapshots: [{ snapshot_at: historicalSnapshot.snapshot_at, path: 'snapshots/historical.json' }] }
    return new Response(JSON.stringify(String(input).includes('manifest') ? manifest : snapshot), { status: 200 })
  }))
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={['/history/2026-10-04T18-41-34Z']}><Routes><Route path="/history/:timestamp" element={<History />} /></Routes></MemoryRouter></QueryClientProvider>)
  await screen.findByRole('heading', { name: /^nfl$/i })
}

it('History cards show the real producer roster', async () => {
  await renderHistorical(historicalSnapshot)
  const lists = screen.getAllByRole('list')
  expect(lists.some((list) => within(list).queryByText('Trevor Lawrence'))).toBe(true)
  expect(lists.some((list) => within(list).queryByText('QB'))).toBe(true)
})

it.each([
  { metric: undefined, standing: { is_cashing: true, payout_cents: 12000 }, label: 'Cashed $120' },
  { metric: { points_delta: 15 }, standing: undefined, label: 'Cashed' },
  { metric: undefined, standing: { is_cashing: false, payout_cents: 0 }, label: 'Not cashing' },
])('History cashing uses matched evidence and only standings supply money ($label)', async ({ metric, standing, label }) => {
  const snapshot = structuredClone(historicalSnapshot)
  const contest = snapshot.sports.nfl.contests[0]
  const vip = contest.vip_lineups[0]
  contest.vip_lineups = [vip]
  contest.state = 'completed'
  Object.assign(contest, {
    standings: standing ? [{ entry_key: vip.entry_key, ...standing }] : [],
    metrics: { updated_at: snapshot.generated_at, ...(metric ? { distance_to_cash: { per_vip: [{ vip_entry_key: vip.vip_entry_key, ...metric }] } } : {}) },
  })
  await renderHistorical(snapshot)
  expect(screen.getByText(label)).toBeInTheDocument()
  if (!standing) expect(screen.queryByText(/Cashed \$/)).not.toBeInTheDocument()
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
  const lists = screen.getAllByRole('list', { name: /sport status/i })
  expect(lists).toHaveLength(producerManifest.snapshots.length)
  for (const list of lists) {
    const items = within(list).getAllByRole('listitem').map((item) => item.textContent)
    expect(items).toHaveLength(3)
    for (const item of items) {
      expect(item).toMatch(/^(cfb|golf|mlb): (Fresh|Stale|Error)$/)
    }
  }
})
