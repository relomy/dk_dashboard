import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
// Exported by the dk_results producer; provenance in public/mock/PRODUCER_FIXTURE.md.
import producerSnapshot from '../../public/mock/snapshots/live-2026-10-03T20-48-31Z.json'
import App from '../App'
import type { Snapshot } from '../lib/types'

// The home page and /latest both land on Live. The producer fixture has cfb, golf and mlb,
// each with a live primary contest.

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

it('opens Live for the last-viewed sport from the home page', async () => {
  store.set('dk_dashboard_last_sport', 'mlb')
  stubApi(load())
  renderApp('/')

  expect(await screen.findByRole('heading', { name: /live: mlb/i })).toBeInTheDocument()
  expect(currentPath()).toBe('/live/mlb')
})

it('opens the first sport with a live primary contest for a first-time visitor', async () => {
  const snapshot = load()
  snapshot.sports.cfb.contests[0].state = 'completed'
  stubApi(snapshot)
  renderApp('/')

  expect(await screen.findByRole('heading', { name: /live: golf/i })).toBeInTheDocument()
  expect(currentPath()).toBe('/live/golf')
})

it('opens the first available sport when no primary contest is live', async () => {
  const snapshot = load()
  for (const sport of Object.values(snapshot.sports)) sport.contests[0].state = 'completed'
  stubApi(snapshot)
  renderApp('/')

  expect(await screen.findByRole('heading', { name: /live: cfb/i })).toBeInTheDocument()
})

it('ignores a remembered sport the snapshot no longer has', async () => {
  store.set('dk_dashboard_last_sport', 'nba')
  stubApi(load())
  renderApp('/')

  expect(await screen.findByRole('heading', { name: /live: cfb/i })).toBeInTheDocument()
})

it('lands on the first sport when browser storage is unavailable', async () => {
  vi.stubGlobal('localStorage', undefined)
  stubApi(load())
  renderApp('/')

  expect(await screen.findByRole('heading', { name: /live: cfb/i })).toBeInTheDocument()
})

it('remembers the sport last viewed on Live for the next visit', async () => {
  stubApi(load())
  renderApp('/live/golf')
  await screen.findByRole('heading', { name: /live: golf/i })

  cleanup()
  renderApp('/')

  expect(await screen.findByRole('heading', { name: /live: golf/i })).toBeInTheDocument()
})

it('redirects the retired /latest URL to the landing view', async () => {
  store.set('dk_dashboard_last_sport', 'golf')
  stubApi(load())
  renderApp('/latest')

  expect(await screen.findByRole('heading', { name: /live: golf/i })).toBeInTheDocument()
  expect(currentPath()).toBe('/live/golf')
})

it('says so when the snapshot has no sports', async () => {
  const snapshot = load()
  snapshot.sports = {}
  stubApi(snapshot)
  renderApp('/')

  expect(await screen.findByText(/no sports available/i)).toBeInTheDocument()
})

it('brand link returns to the landing view', async () => {
  stubApi(load())
  renderApp('/settings')

  const brand = await screen.findByRole('link', { name: /dk\/live/i })
  expect(brand).toHaveAttribute('href', '/')
})

it('reaches the multi-contest Sport page from All contests', async () => {
  stubApi(load())
  renderApp('/')
  await screen.findByRole('heading', { name: /live: cfb/i })

  fireEvent.pointerDown(screen.getByRole('button', { name: /user menu/i }), { button: 0, ctrlKey: false })
  fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: /all contests/i }))

  expect(await screen.findByRole('heading', { name: /sport: cfb/i })).toBeInTheDocument()
})
