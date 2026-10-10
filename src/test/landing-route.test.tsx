import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
// Exported by the dk_results producer; provenance in public/mock/PRODUCER_FIXTURE.md.
import producerSnapshot from '../../public/mock/snapshots/live-2026-10-03T20-48-31Z.json'
import App from '../App'
import type { Snapshot } from '../lib/types'

// The home page and /latest both land on Live. The producer fixture has cfb, golf and mlb,
// each with a live primary contest. Landing order: live primary contest, most recently completed
// primary contest, last-viewed sport, first sport.

const store = new Map<string, string>()

beforeEach(() => {
  store.clear()
  // Node's own `localStorage` shadows jsdom's in this environment, so tests bring a working one.
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  cleanup()
})

function load(): Snapshot {
  return structuredClone(producerSnapshot) as unknown as Snapshot
}

function stubApi(snapshot: Snapshot) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/auth/me')) {
        return new Response(
          JSON.stringify({ user: { id: 'u1', username: 'dana', role: 'friend', must_change_password: false } }),
          { status: 200 },
        )
      }
      if (url.includes('/api/latest')) {
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
      if (url.includes('/api/snapshot')) {
        return new Response(JSON.stringify(snapshot), { status: 200 })
      }
      return new Response(JSON.stringify({ error: { code: 'not_found', message: 'Not found' } }), { status: 404 })
    }),
  )
}

function Path() {
  const { pathname } = useLocation()
  return <output aria-label="current path">{pathname}</output>
}

function renderApp(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <App />
        <Path />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const currentPath = () => screen.getByLabelText('current path').textContent

// Every test renders the whole App (auth, latest, snapshot fetches) on the full producer fixture, and the first in
// the file also pays for the cold start. Under full-suite load that can outrun findBy's default 1s, so the
// landing waits get 3s: still well inside the 5s test timeout, so a view that never appears fails here.
const APP_READY = { timeout: 3000 }

it('opens Live for the last-viewed sport when nothing is live or completed', async () => {
  store.set('dk_dashboard_last_sport', 'mlb')
  const snapshot = load()
  for (const sport of Object.values(snapshot.sports)) sport.contests[0].state = 'cancelled'
  stubApi(snapshot)
  renderApp('/')

  expect(await screen.findByRole('heading', { name: /live: mlb/i }, APP_READY)).toBeInTheDocument()
  expect(currentPath()).toBe('/live/mlb')
})

it('opens a live primary contest over the last-viewed sport', async () => {
  store.set('dk_dashboard_last_sport', 'mlb')
  const snapshot = load()
  snapshot.sports.mlb.contests[0].state = 'completed'
  stubApi(snapshot)
  renderApp('/')

  expect(await screen.findByRole('heading', { name: /live: cfb/i }, APP_READY)).toBeInTheDocument()
})

it('opens the most recently completed primary contest over a stale last-viewed sport', async () => {
  store.set('dk_dashboard_last_sport', 'cfb')
  const snapshot = load()
  for (const sport of Object.values(snapshot.sports)) sport.contests[0].state = 'completed'
  snapshot.sports.golf.contests[0].start_time = '2026-10-04T01:00:00Z'
  stubApi(snapshot)
  renderApp('/')

  expect(await screen.findByRole('heading', { name: /live: golf/i }, APP_READY)).toBeInTheDocument()
  expect(currentPath()).toBe('/live/golf')
})

it('ignores a cancelled contest when choosing the most recently completed one', async () => {
  const snapshot = load()
  for (const sport of Object.values(snapshot.sports)) sport.contests[0].state = 'completed'
  snapshot.sports.mlb.contests[0].state = 'cancelled'
  snapshot.sports.cfb.contests[0].state = 'cancelled'
  stubApi(snapshot)
  renderApp('/')

  expect(await screen.findByRole('heading', { name: /live: golf/i }, APP_READY)).toBeInTheDocument()
})

it('opens the first sport with a live primary contest for a first-time visitor', async () => {
  const snapshot = load()
  snapshot.sports.cfb.contests[0].state = 'completed'
  stubApi(snapshot)
  renderApp('/')

  expect(await screen.findByRole('heading', { name: /live: golf/i }, APP_READY)).toBeInTheDocument()
  expect(currentPath()).toBe('/live/golf')
})

it('opens the first available sport when no primary contest is live or completed', async () => {
  const snapshot = load()
  for (const sport of Object.values(snapshot.sports)) sport.contests[0].state = 'cancelled'
  stubApi(snapshot)
  renderApp('/')

  expect(await screen.findByRole('heading', { name: /live: cfb/i }, APP_READY)).toBeInTheDocument()
})

it('ignores a remembered sport the snapshot no longer has', async () => {
  store.set('dk_dashboard_last_sport', 'nba')
  stubApi(load())
  renderApp('/')

  expect(await screen.findByRole('heading', { name: /live: cfb/i }, APP_READY)).toBeInTheDocument()
})

it('lands on the first sport when browser storage is unavailable', async () => {
  vi.stubGlobal('localStorage', undefined)
  stubApi(load())
  renderApp('/')

  expect(await screen.findByRole('heading', { name: /live: cfb/i }, APP_READY)).toBeInTheDocument()
})

it('remembers the sport last viewed on Live for the next visit', async () => {
  const snapshot = load()
  for (const sport of Object.values(snapshot.sports)) sport.contests[0].state = 'cancelled'
  stubApi(snapshot)
  renderApp('/live/golf')
  await screen.findByRole('heading', { name: /live: golf/i }, APP_READY)

  cleanup()
  renderApp('/')

  expect(await screen.findByRole('heading', { name: /live: golf/i }, APP_READY)).toBeInTheDocument()
})

it('redirects the retired /latest URL to the landing view', async () => {
  store.set('dk_dashboard_last_sport', 'cfb')
  const snapshot = load()
  for (const sport of Object.values(snapshot.sports)) sport.contests[0].state = 'completed'
  snapshot.sports.golf.contests[0].start_time = '2026-10-04T01:00:00Z'
  stubApi(snapshot)
  renderApp('/latest')

  expect(await screen.findByRole('heading', { name: /live: golf/i }, APP_READY)).toBeInTheDocument()
  expect(currentPath()).toBe('/live/golf')
})

it('says so when the snapshot has no sports', async () => {
  const snapshot = load()
  snapshot.sports = {}
  stubApi(snapshot)
  renderApp('/')

  expect(await screen.findByText(/no sports available/i, undefined, APP_READY)).toBeInTheDocument()
})

it('brand link returns to the landing view', async () => {
  stubApi(load())
  renderApp('/settings')

  const brand = await screen.findByRole('link', { name: /dk\/live/i }, APP_READY)
  expect(brand).toHaveAttribute('href', '/')
})

it('marks a completed primary contest as Final with its start time on Live', async () => {
  const snapshot = load()
  snapshot.sports.cfb.contests[0].state = 'completed'
  stubApi(snapshot)
  renderApp('/live/cfb')

  const marker = await screen.findByLabelText(/contest status/i, undefined, APP_READY)
  expect(within(marker).getByText('Final')).toBeInTheDocument()
  expect(within(marker).getByText(/started/i)).toBeInTheDocument()
  expect(marker.querySelector('time')).toHaveAttribute('datetime', '2026-10-03T16:00:00Z')
  // The completed contest's standings render in full.
  expect(screen.getByRole('navigation', { name: /live views/i })).toBeInTheDocument()
  expect(screen.getByRole('complementary', { name: /leverage/i })).toBeInTheDocument()
})

it.each(['players', 'vips', 'trains', 'leverage'])('renders a completed contest on the %s view without errors', async (view) => {
  const snapshot = load()
  snapshot.sports.cfb.contests[0].state = 'completed'
  stubApi(snapshot)
  const error = vi.spyOn(console, 'error')
  renderApp(`/live/cfb?view=${view}`)

  expect(await screen.findByLabelText(/contest status/i, undefined, APP_READY)).toBeInTheDocument()
  expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument()
  expect(error).not.toHaveBeenCalled()
})

it.each(['live', 'upcoming', 'cancelled'] as const)('does not mark a %s primary contest as Final', async (state) => {
  const snapshot = load()
  snapshot.sports.cfb.contests[0].state = state
  stubApi(snapshot)
  renderApp('/live/cfb')

  await screen.findByRole('heading', { name: /live: cfb/i }, APP_READY)
  // Player game statuses also read "Final", so the contest's own marker is found by its label.
  expect(screen.queryByLabelText(/contest status/i)).not.toBeInTheDocument()
})

it('reaches the multi-contest Sport page from All contests', async () => {
  stubApi(load())
  renderApp('/')
  await screen.findByRole('heading', { name: /live: cfb/i }, APP_READY)

  fireEvent.pointerDown(screen.getByRole('button', { name: /user menu/i }), { button: 0, ctrlKey: false })
  fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: /all contests/i }))

  expect(await screen.findByRole('heading', { name: /sport: cfb/i }, APP_READY)).toBeInTheDocument()
})
