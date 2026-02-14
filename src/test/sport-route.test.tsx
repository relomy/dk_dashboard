import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import snapshotFixture from '../../public/mock/snapshots/2026-02-13T18-25-00Z.json'
import Sport from '../routes/Sport'

vi.mock('../context/ProfileContext', () => ({
  useProfiles: () => ({
    activeProfile: {
      id: 'p1',
      name: 'Alex',
      rules: { contains: 'alex' },
    },
  }),
}))

afterEach(() => {
  vi.restoreAllMocks()
  cleanup()
})

it('uses cached snapshot and renders grouped contests plus player table behavior', async () => {
  const fetchSpy = vi.fn()
  vi.stubGlobal('fetch', fetchSpy)

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData(['snapshot', 'cached.json'], snapshotFixture)

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/sport/nba']}>
        <Routes>
          <Route path="/sport/:sport" element={<Sport />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )

  expect(await screen.findByRole('heading', { name: /sport: nba/i })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: /upcoming \(1\)/i })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: /live \(1\)/i })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: /completed \(0\)/i })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: /cancelled \(0\)/i })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: /unknown \(0\)/i })).toBeInTheDocument()
  expect(screen.getByText('Alex Core')).toBeInTheDocument()
  expect(screen.getByText('Jamie SD')).toBeInTheDocument()

  fireEvent.change(screen.getByLabelText(/vip filter/i), { target: { value: 'active' } })
  expect(screen.getByText('Alex Core')).toBeInTheDocument()
  expect(screen.queryByText('Jamie SD')).not.toBeInTheDocument()

  const playerRows = screen.getAllByRole('row')
  expect(within(playerRows[1]).getByText('Guard One')).toBeInTheDocument()

  fireEvent.change(screen.getByLabelText(/search players/i), { target: { value: 'Captain Candidate' } })
  expect(screen.getByRole('cell', { name: 'Captain Candidate' })).toBeInTheDocument()
  expect(screen.queryByRole('cell', { name: 'Guard One' })).not.toBeInTheDocument()

  expect(fetchSpy).not.toHaveBeenCalled()
})

it('loads latest snapshot when cache is empty', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/latest')) {
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
      <MemoryRouter initialEntries={['/sport/nfl']}>
        <Routes>
          <Route path="/sport/:sport" element={<Sport />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )

  fireEvent.change(screen.getByLabelText(/access key/i), { target: { value: 'test-key' } })
  fireEvent.click(screen.getByRole('button', { name: /save key/i }))

  expect(await screen.findByRole('heading', { name: /sport: nfl/i })).toBeInTheDocument()
  expect(await screen.findByRole('heading', { name: /unknown \(1\)/i })).toBeInTheDocument()
})
