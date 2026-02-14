import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import snapshotFixture from '../../public/mock/snapshots/canonical-live-snapshot.json'
import missingSectionsFixture from '../../public/mock/snapshots/canonical-live-snapshot-missing-sections.json'
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
  latest_snapshot_path: 'snapshots/canonical-live-snapshot.json',
  snapshot_at: '2026-02-13T18:25:00Z',
  generated_at: '2026-02-13T18:25:07Z',
  available_sports: ['nba'],
  manifest_today_path: 'manifest/2026-02-13.json',
}

function firstVipDisplayName(snapshot: any): string | null {
  for (const sport of Object.values(snapshot.sports ?? {})) {
    for (const contest of (sport as any).contests ?? []) {
      const lineup = (contest.vip_lineups ?? [])[0]
      if (lineup?.display_name) {
        return lineup.display_name
      }
    }
  }
  return null
}

afterEach(() => {
  vi.restoreAllMocks()
})

it('renders latest snapshot summary', async () => {
  const vipName = firstVipDisplayName(snapshotFixture)
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/latest') || url.includes('/mock/latest.json')) {
        return new Response(JSON.stringify(latestPayload), { status: 200 })
      }
      return new Response(JSON.stringify(snapshotFixture), { status: 200 })
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
  if (vipName) {
    expect(screen.getByText(vipName)).toBeInTheDocument()
  }

  fireEvent.change(screen.getByLabelText(/vip filter/i), { target: { value: 'active' } })

  expect(screen.getAllByText(/no matching vip lineups/i).length).toBeGreaterThan(0)
})

it('renders latest route with missing live-only sections fixture', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/latest') || url.includes('/mock/latest.json')) {
        return new Response(
          JSON.stringify({
            ...latestPayload,
            latest_snapshot_path: 'snapshots/canonical-live-snapshot-missing-sections.json',
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
  expect(screen.getAllByText(/no matching vip lineups/i).length).toBeGreaterThan(0)
})
