import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import snapshotFixture from '../../public/mock/snapshots/2026-02-13T18-25-00Z.json'
import Live from '../routes/Live'

afterEach(() => {
  vi.restoreAllMocks()
  cleanup()
})

it('resolves and renders the selected primary contest for live route', async () => {
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

      return new Response(JSON.stringify(snapshotFixture), { status: 200 })
    }),
  )

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/live/nba']}>
        <Routes>
          <Route path="/live/:sport" element={<Live />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )

  fireEvent.change(screen.getByLabelText(/access key/i), { target: { value: 'test-key' } })
  fireEvent.click(screen.getByRole('button', { name: /save key/i }))

  expect(await screen.findByRole('heading', { name: /live: nba/i })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: /primary contest/i })).toBeInTheDocument()
  expect(screen.getByText(/contest key: nba:1001/i)).toBeInTheDocument()
  expect(screen.getByText(/alex core/i)).toBeInTheDocument()
  expect(screen.queryByText(/jamie sd/i)).not.toBeInTheDocument()
  expect(screen.getByText(/selection reason:/i)).toBeInTheDocument()
})

it('shows explicit state when primary contest is not configured', async () => {
  const snapshotWithoutPrimary = structuredClone(snapshotFixture) as any
  snapshotWithoutPrimary.sports.nba.primary_contest = undefined

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

      return new Response(JSON.stringify(snapshotWithoutPrimary), { status: 200 })
    }),
  )

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/live/nba']}>
        <Routes>
          <Route path="/live/:sport" element={<Live />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )

  fireEvent.change(screen.getByLabelText(/access key/i), { target: { value: 'test-key' } })
  fireEvent.click(screen.getByRole('button', { name: /save key/i }))

  expect(await screen.findByRole('heading', { name: /live: nba/i })).toBeInTheDocument()
  expect(screen.getByText(/primary contest is not configured for this sport/i)).toBeInTheDocument()
})

it('prefers contest.is_primary before primary_contest key/id fallbacks', async () => {
  const snapshotWithConflictingPointers = structuredClone(snapshotFixture) as any
  snapshotWithConflictingPointers.sports.nba.primary_contest = {
    contest_id: '1002',
    contest_key: 'nba:1002',
    selection_reason: 'conflict-for-test',
    selected_at: '2026-02-13T18:25:05Z',
  }

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

      return new Response(JSON.stringify(snapshotWithConflictingPointers), { status: 200 })
    }),
  )

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/live/nba']}>
        <Routes>
          <Route path="/live/:sport" element={<Live />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )

  fireEvent.change(screen.getByLabelText(/access key/i), { target: { value: 'test-key' } })
  fireEvent.click(screen.getByRole('button', { name: /save key/i }))

  expect(await screen.findByRole('heading', { name: /live: nba/i })).toBeInTheDocument()
  expect(screen.getByText(/contest key: nba:1001/i)).toBeInTheDocument()
  expect(screen.queryByText(/contest key: nba:1002/i)).not.toBeInTheDocument()
})

it('uses cashing fallback from payout and preserves slot order with player-name fallback', async () => {
  const snapshotWithUnknownSlotPlayer = structuredClone(snapshotFixture) as any
  snapshotWithUnknownSlotPlayer.sports.nba.contests[0].vip_lineups[1].slots[1].player_id = 'nba-p999'

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

      return new Response(JSON.stringify(snapshotWithUnknownSlotPlayer), { status: 200 })
    }),
  )

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/live/nba']}>
        <Routes>
          <Route path="/live/:sport" element={<Live />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )

  fireEvent.change(screen.getByLabelText(/access key/i), { target: { value: 'test-key' } })
  fireEvent.click(screen.getByRole('button', { name: /save key/i }))

  expect(await screen.findByRole('heading', { name: /live: nba/i })).toBeInTheDocument()
  expect(screen.getByText(/fallback cash/i)).toBeInTheDocument()
  expect(screen.getAllByText(/cashing/i).length).toBeGreaterThan(0)
  expect(screen.getByText(/cash-line delta: —/i)).toBeInTheDocument()

  const fallbackCard = screen.getByText(/fallback cash/i).closest('li')
  if (!fallbackCard) {
    throw new Error('Fallback lineup card not found')
  }

  const slotItems = within(fallbackCard).getAllByRole('listitem')
  expect(slotItems[0]).toHaveTextContent('PG: Guard One')
  expect(slotItems[1]).toHaveTextContent('UTIL: nba-p999')
})
