import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import snapshot from './fixtures/nfl-live-2026-10-04T20-41-34Z.json'
import Live from '../routes/Live'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('follows the latest pointer when older and historical snapshots are already cached', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const old = structuredClone(snapshot)
  old.sports.nfl.contests[0].name = 'Old contest'
  const current = structuredClone(snapshot)
  current.sports.nfl.contests[0].name = 'Current contest'
  current.sports.nfl.players.find(p => p.name === 'Trevor Lawrence')!.fantasy_points = 99
  client.setQueryData(['snapshot', 'history.json'], old)
  client.setQueryData(['snapshot', 'old.json'], old)
  client.setQueryData(['latest'], { latest_snapshot_path: 'old.json' })
  const fetchSpy = vi.fn(async () => new Response(JSON.stringify(current)))
  vi.stubGlobal('fetch', fetchSpy)

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/live/nfl']}>
        <Routes><Route path="/live/:sport" element={<Live />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  await screen.findByRole('heading', { name: /live: nfl/i })
  await act(async () => {
    client.setQueryData(['latest'], { latest_snapshot_path: 'current.json' })
  })
  await screen.findByRole('row', { name: /Trevor Lawrence.*99\.00/ }, { timeout: 5000 })
  expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining('current.json'), expect.anything())
  client.clear()
})
