import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import snapshot from '../../public/mock/snapshots/live-2026-10-04T18-41-34Z.json'
import Landing from '../routes/Landing'
import Live from '../routes/Live'
import Sport from '../routes/Sport'

vi.mock('../context/ProfileContext', () => ({
  useProfiles: () => ({ activeProfile: { id: 'p1', name: 'Alex', rules: { contains: 'alex' } } }),
}))

// Snapshot objects are immutable (ADR-0001: each key is a timestamped path that is never rewritten), so
// the only request worth making is the one for a path the dashboard has not fetched yet.

const POLL_MS = 300_000

let pointer: string
let requests: string[]
/** What each path serves when it isn't the default fixture. */
let served: Record<string, unknown>
const store = new Map<string, string>()

/** Stubs the API as the producer cycle drives it: `/api/latest` names the newest path, each path serves its own snapshot. */
function stubApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/latest')) {
        requests.push('latest')
        return new Response(JSON.stringify({ latest_snapshot_path: pointer }))
      }
      const path = decodeURIComponent(new URL(url, 'http://localhost').searchParams.get('path') ?? '')
      requests.push(path)
      return new Response(JSON.stringify(served[path] ?? snapshot))
    }),
  )
}

function renderLive(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/live/nfl']}>
        <Routes><Route path="/live/:sport" element={<Live />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return client
}

/** Opens Live, lets it poll to the second snapshot, then leaves; the returned client still holds every snapshot it fetched. */
async function pollLiveToSecondSnapshot() {
  const client = renderLive()
  await screen.findByRole('heading', { name: /live: nfl/i })
  await producerCycle('snapshots/second.json')
  await screen.findByRole('heading', { name: /live: nfl/i })
  cleanup()
  return client
}

async function producerCycle(next: string) {
  pointer = next
  await act(async () => {
    await vi.advanceTimersByTimeAsync(POLL_MS)
  })
  await vi.waitFor(() => expect(requests).toContain(next))
}

const count = (key: string) => requests.filter((request) => request === key).length

beforeEach(() => {
  pointer = 'snapshots/first.json'
  requests = []
  served = {}
  store.clear()
  // Node's own `localStorage` shadows jsdom's in this environment, so tests bring a working one.
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  })
  vi.useFakeTimers({ shouldAdvanceTime: true })
  stubApi()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('fetches each snapshot path once while Live polls across producer cycles', async () => {
  const client = renderLive()
  await screen.findByRole('heading', { name: /live: nfl/i })

  await producerCycle('snapshots/second.json')
  await producerCycle('snapshots/third.json')

  expect(count('latest')).toBe(3)
  expect(count('snapshots/first.json')).toBe(1)
  expect(count('snapshots/second.json')).toBe(1)
  expect(count('snapshots/third.json')).toBe(1)
  client.clear()
})

it('does not refetch a loaded snapshot when the tab regains focus', async () => {
  const client = renderLive()
  await screen.findByRole('heading', { name: /live: nfl/i })

  // Long enough that a query with an ordinary freshness window would count as stale and refetch on focus.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(POLL_MS - 1000)
  })
  await act(async () => {
    window.dispatchEvent(new Event('visibilitychange'))
  })
  await vi.advanceTimersByTimeAsync(100)

  expect(count('snapshots/first.json')).toBe(1)
  client.clear()
})

it('shows Sport the snapshot Live has polled to, not an older one still in the cache', async () => {
  const current = structuredClone(snapshot)
  current.sports.nfl.players.find((player) => player.name === 'Trevor Lawrence')!.fantasy_points = 99
  served['snapshots/second.json'] = current
  const client = await pollLiveToSecondSnapshot()

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/sport/nfl']}>
        <Routes><Route path="/sport/:sport" element={<Sport />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )

  await screen.findByRole('row', { name: /Trevor Lawrence.*99\.00/ })
  client.clear()
})

it('lands on a sport from the snapshot Live has polled to, not an older one still in the cache', async () => {
  const current = structuredClone(snapshot) as { sports: Record<string, unknown> }
  delete current.sports.golf
  served['snapshots/second.json'] = current
  const client = await pollLiveToSecondSnapshot()
  // Live remembers the sport it showed, which would decide the landing; start from a visitor with no memory.
  store.clear()

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/live/:sport" element={<LandedOn />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )

  // The first snapshot has golf, listed ahead of nfl, so landing from it would open golf.
  await screen.findByText('Landed on nfl')
  client.clear()
})

function LandedOn() {
  return <p>Landed on {useParams().sport}</p>
}
