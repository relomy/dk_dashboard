import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AppShell from '../components/AppShell'
import { AuthProvider } from '../context/AuthProvider'
import { ProfileProvider } from '../context/ProfileProvider'
import { load, vipOf } from './liveHarness'

const store = new Map<string, string>()
let pointer: string
let served: Record<string, unknown>
let role: 'owner' | 'friend'

function stubApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/auth/me')) {
        return new Response(
          JSON.stringify({ user: { id: 'u1', username: 'dana', role, must_change_password: false } }),
          { status: 200 },
        )
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
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <ProfileProvider>
            <Routes>
              <Route element={<AppShell />}>
                <Route path="/live/:sport" element={<p>live page</p>} />
                <Route path="/settings" element={<p>settings page</p>} />
              </Route>
            </Routes>
          </ProfileProvider>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return client
}

/** The next poll's snapshot: the same slate with one VIP ten places up, well past the noise threshold. */
function pollWithMovedVip() {
  const snapshot = load()
  snapshot.snapshot_at = '2026-10-04T18:46:34Z'
  const vip = vipOf(snapshot, 'EmpireMaker2')
  vip.rank = 10
  return snapshot
}

beforeEach(() => {
  store.clear()
  role = 'owner'
  pointer = 'snapshots/first.json'
  served = { 'snapshots/first.json': load() }
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  })
  stubApi()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('the Shifts entry point in the app shell', () => {
  it('links to the viewed sport’s Shifts page', async () => {
    renderShell('/live/nfl')
    const link = await screen.findByRole('link', { name: /^Shifts, \d+ unseen$/ })
    expect(link.getAttribute('href')).toBe('/shifts/nfl')
  })

  it('shows on a page without a sport and links to the last-viewed sport', async () => {
    store.set('dk_dashboard_last_sport', 'golf')
    renderShell('/settings')
    const link = await screen.findByRole('link', { name: /^Shifts, \d+ unseen$/ })
    expect(link.getAttribute('href')).toBe('/shifts/golf')
  })

  it('is left out on a page without a sport when no sport was viewed yet', async () => {
    renderShell('/settings')
    await screen.findByText('settings page')
    expect(screen.queryByRole('link', { name: /^Shifts/ })).toBeNull()
  })

  it('is shown to a friend too', async () => {
    role = 'friend'
    renderShell('/live/nfl')
    expect(await screen.findByRole('link', { name: /^Shifts, \d+ unseen$/ })).toBeTruthy()
  })

  it('counts a poll’s new shifts without a page reload', async () => {
    const client = renderShell('/live/nfl')
    await screen.findByRole('link', { name: 'Shifts, 0 unseen' })

    await vi.waitFor(() => expect([...store.keys()].some((key) => key.startsWith('dk_dashboard_shifts_'))).toBe(true))
    served['snapshots/second.json'] = pollWithMovedVip()
    pointer = 'snapshots/second.json'
    await act(async () => {
      await client.refetchQueries({ queryKey: ['latest'] })
    })

    expect(await screen.findByRole('link', { name: 'Shifts, 1 unseen' })).toBeTruthy()
    expect(screen.getByTestId('shifts-badge').dataset.tone).toBe('grey')
  })
})
