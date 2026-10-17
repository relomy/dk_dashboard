import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AppShell from '../components/AppShell'
import { AuthProvider } from '../context/AuthProvider'
import { ProfileProvider } from '../context/ProfileProvider'
import { contestOf, load } from './liveHarness'

// The banner with the real Shifts feed behind the app shell: what shows, what a reload brings back, and what a
// long absence summarises. Time is the clock the shell reads, so a "reload" is a remount at a later `Date.now()`.

const store = new Map<string, string>()
let pointer: string
let served: Record<string, unknown>
let role: 'owner' | 'friend'

const T0 = Date.parse('2026-10-04T18:41:34Z')
const MINUTE = 60_000

function stubApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/auth/me')) {
        return new Response(JSON.stringify({ user: { id: 'u1', username: 'dana', role, must_change_password: false } }), { status: 200 })
      }
      if (url.includes('/api/auth/csrf')) {
        return new Response(JSON.stringify({ csrf_token: 'csrf_1' }), { status: 200 })
      }
      if (url.includes('/api/latest')) {
        return new Response(
          JSON.stringify({
            latest_snapshot_path: pointer,
            snapshot_at: '2026-10-04T18:41:34Z',
            generated_at: '2026-10-04T18:41:34Z',
            available_sports: ['golf', 'nfl'],
            manifest_today_path: 'manifest/2026-10-04.json',
          }),
          { status: 200 },
        )
      }
      const path = decodeURIComponent(new URL(url, 'http://x').searchParams.get('path') ?? '')
      return new Response(JSON.stringify(served[path]), { status: 200 })
    }),
  )
}

function renderShell(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <ProfileProvider>
            <Routes>
              <Route element={<AppShell />}>
                <Route path="/live/:sport" element={<p>live page</p>} />
              </Route>
            </Routes>
          </ProfileProvider>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { client, ...view }
}

/** A snapshot where each named NFL VIP has moved from just outside cashing to just inside it. */
function cashedIn(...names: string[]) {
  const snapshot = load()
  const metrics = contestOf(snapshot).metrics.distance_to_cash.per_vip
  for (const name of names) {
    const row = metrics.find((vip: { display_name: string }) => vip.display_name === name)
    row.points_delta = 2.2
    row.rank_delta = -2
  }
  return snapshot
}

/** The golf VIP Cubbiesftw23 moved inside the cash line. */
function golfCashedIn() {
  const snapshot = load()
  const row = contestOf(snapshot, 'golf').metrics.distance_to_cash.per_vip.find(
    (vip: { display_name: string }) => vip.display_name === 'Cubbiesftw23',
  )
  row.points_delta = 2
  row.rank_delta = -2
  return snapshot
}

async function poll(client: QueryClient, snapshot: unknown) {
  const path = `snapshots/poll-${Math.random()}.json`
  served[path] = snapshot
  pointer = path
  await act(async () => {
    await client.refetchQueries({ queryKey: ['latest'] })
  })
}

/** Waits for the first Live build to be recorded, so a later remount is a return rather than a first visit. */
const seeded = () => vi.waitFor(() => expect(store.has('dk_dashboard_shifts_nfl')).toBe(true))

const banner = () => screen.queryByRole('region', { name: 'Shifts banner' })

beforeEach(() => {
  store.clear()
  role = 'owner'
  pointer = 'snapshots/first.json'
  served = { 'snapshots/first.json': load() }
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  })
  stubApi()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('the Shifts banner in the app shell', () => {
  it('shows nothing before anything crosses the cash line', async () => {
    renderShell('/live/nfl')
    await screen.findByText('live page')
    await screen.findByRole('link', { name: 'Shifts, 0 unseen' })
    expect(banner()).toBeNull()
  })

  it('shows a row for a crossing on any page, linking to the Shifts page', async () => {
    const { client } = renderShell('/live/nfl')
    await screen.findByRole('link', { name: 'Shifts, 0 unseen' })
    vi.setSystemTime(T0 + MINUTE)
    await poll(client, cashedIn('EmpireMaker2'))
    const [row] = await screen.findAllByRole('listitem')
    expect(row.textContent).toContain('EmpireMaker2 moved into cashing')
    expect(within(row).getByRole('link', { name: 'View' }).getAttribute('href')).toBe('/shifts/nfl')
  })

  it('is left out for anyone but the owner', async () => {
    role = 'friend'
    const { client } = renderShell('/live/nfl')
    await screen.findByText('live page')
    await poll(client, cashedIn('EmpireMaker2'))
    expect(banner()).toBeNull()
  })

  it('does not bring a dismissed row back after a reload, and brings back one that was never dismissed', async () => {
    const first = renderShell('/live/nfl')
    await screen.findByRole('link', { name: 'Shifts, 0 unseen' })
    vi.setSystemTime(T0 + MINUTE)
    await poll(first.client, cashedIn('EmpireMaker2', 'tuck8989'))
    const rows = await screen.findAllByRole('listitem')
    expect(rows).toHaveLength(2)
    const empire = rows.find((row) => row.textContent?.includes('EmpireMaker2')) as HTMLElement
    fireEvent.click(within(empire).getByRole('button', { name: 'Dismiss' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(1)

    first.unmount()
    served['snapshots/first.json'] = cashedIn('EmpireMaker2', 'tuck8989')
    pointer = 'snapshots/first.json'
    vi.setSystemTime(T0 + 20 * MINUTE)
    renderShell('/live/nfl')
    const [row] = await screen.findAllByRole('listitem')
    expect(row.textContent).toContain('tuck8989 moved into cashing')
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
  })

  it('shows one "while you were away" line after a long absence with something unseen', async () => {
    const first = renderShell('/live/nfl')
    await seeded()
    first.unmount()

    served['snapshots/first.json'] = cashedIn('EmpireMaker2')
    vi.setSystemTime(T0 + 45 * MINUTE + 5000)
    renderShell('/live/nfl')
    const summary = await screen.findByText(/while you were away/i)
    const row = summary.closest('li') as HTMLElement
    expect(row.textContent).toContain('45 minutes')
    expect(row.textContent).toContain('1 unseen')
    expect(row.textContent).toContain('EmpireMaker2 moved into cashing')
    expect(within(row).getByRole('link', { name: 'Open' }).getAttribute('href')).toBe('/shifts/nfl')
    expect(screen.getAllByText(/while you were away/i)).toHaveLength(1)
  })

  it('shows no summary after a long absence with nothing unseen', async () => {
    const first = renderShell('/live/nfl')
    await seeded()
    first.unmount()

    vi.setSystemTime(T0 + 45 * MINUTE + 5000)
    renderShell('/live/nfl')
    await screen.findByRole('link', { name: 'Shifts, 0 unseen' })
    expect(banner()).toBeNull()
  })

  it('shows the rows for the sport on screen and updates them when the sport changes', async () => {
    const { client } = renderShell('/live/nfl')
    await screen.findByRole('link', { name: 'Shifts, 0 unseen' })
    fireEvent.click(await screen.findByRole('link', { name: /golf/i }))
    await screen.findByRole('link', { name: /^Shifts, \d+ unseen$/ })

    vi.setSystemTime(T0 + MINUTE)
    const both = cashedIn('EmpireMaker2')
    const golf = golfCashedIn()
    both.sports.golf = golf.sports.golf
    await poll(client, both)
    const [golfRow] = await screen.findAllByRole('listitem')
    expect(golfRow.textContent).toContain('Cubbiesftw23 moved into cashing')

    fireEvent.click(screen.getByRole('link', { name: /nfl/i }))
    const [nflRow] = await screen.findAllByRole('listitem')
    expect(nflRow.textContent).toContain('EmpireMaker2 moved into cashing')
    expect(screen.queryByText(/Cubbiesftw23 moved into cashing/)).toBeNull()
  })

  it('says "You" for the VIP the active Profile\'s username rule matches', async () => {
    store.set(
      'dk_dashboard_profiles',
      JSON.stringify([{ id: 'me', name: 'Me', rules: { username: 'EmpireMaker2' } }]),
    )
    store.set('dk_dashboard_active_profile_id', 'me')
    const { client } = renderShell('/live/nfl')
    await screen.findByRole('link', { name: 'Shifts, 0 unseen' })
    vi.setSystemTime(T0 + MINUTE)
    await poll(client, cashedIn('EmpireMaker2', 'tuck8989'))
    const rows = await screen.findAllByRole('listitem')
    const text = rows.map((row) => row.textContent ?? '')
    expect(text.some((line) => line.includes('You moved into cashing'))).toBe(true)
    expect(text.some((line) => line.includes('tuck8989 moved into cashing'))).toBe(true)
    expect(text.some((line) => line.includes('EmpireMaker2'))).toBe(false)
  })
})
