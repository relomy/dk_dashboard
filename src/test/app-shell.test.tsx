import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import indexHtml from '../../index.html?raw'
import snapshotFixture from '../../public/mock/snapshots/live-2026-10-03T20-48-31Z.json'
import App from '../App'
import AppShell from '../components/AppShell'
import TopBarSlot from '../components/TopBarSlot'
import { AuthProvider } from '../context/AuthProvider'
import { ProfileProvider } from '../context/ProfileProvider'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const sportsSnapshot = {
  ...snapshotFixture,
  sports: {
    nba: { ...snapshotFixture.sports.mlb, status: 'ok' },
    nfl: { ...snapshotFixture.sports.mlb, status: 'stale' },
    mlb: { ...snapshotFixture.sports.mlb, status: 'error' },
  },
}

function stubApi(role: 'owner' | 'friend', snapshot: unknown = sportsSnapshot) {
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
      if (url.includes('/api/auth/logout')) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      }
      if (url.includes('/api/latest')) {
        return new Response(
          JSON.stringify({
            latest_snapshot_path: 'snapshots/live-2026-10-03T20-48-31Z.json',
            snapshot_at: '2026-10-03T20:48:31Z',
            generated_at: '2026-10-03T20:48:31Z',
            available_sports: [],
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

function renderApp(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function openUserMenu() {
  fireEvent.pointerDown(screen.getByRole('button', { name: /user menu/i }), { button: 0, ctrlKey: false })
  return screen.getByRole('menu')
}

describe('sport tabs', () => {
  it('lists the snapshot sports, links each to its Live view and shows its Status', async () => {
    stubApi('friend')
    renderApp('/settings')

    const tabs = await screen.findByRole('navigation', { name: /sports/i })
    const nba = await within(tabs).findByRole('link', { name: /nba/i })
    const nfl = within(tabs).getByRole('link', { name: /nfl/i })
    const mlb = within(tabs).getByRole('link', { name: /mlb/i })

    expect(within(tabs).getAllByRole('link')).toHaveLength(3)
    expect(nba).toHaveAttribute('href', '/live/nba')
    expect(nfl).toHaveAttribute('href', '/live/nfl')
    expect(mlb).toHaveAttribute('href', '/live/mlb')
    expect(nba).toHaveAccessibleName(/fresh/i)
    expect(nfl).toHaveAccessibleName(/stale/i)
    expect(mlb).toHaveAccessibleName(/error/i)
  })

  it('marks the sport being viewed as current', async () => {
    stubApi('friend')
    renderApp('/live/nfl')

    const tabs = await screen.findByRole('navigation', { name: /sports/i })
    expect(await within(tabs).findByRole('link', { name: /nfl/i })).toHaveAttribute('aria-current', 'page')
    expect(within(tabs).getByRole('link', { name: /nba/i })).not.toHaveAttribute('aria-current')
  })

  it('shows no sport tabs when the snapshot has no sports', async () => {
    stubApi('friend', { ...snapshotFixture, sports: {} })
    renderApp('/settings')

    expect(await screen.findByRole('button', { name: /user menu/i })).toBeInTheDocument()
    await vi.waitFor(() => {
      expect(
        vi.mocked(globalThis.fetch).mock.calls.some(([input]) => String(input).includes('/api/snapshot')),
      ).toBe(true)
    })
    expect(within(screen.getByRole('navigation', { name: /sports/i })).queryAllByRole('link')).toHaveLength(0)
  })
})

describe('user menu', () => {
  it('holds the Profile switcher, All contests, History, Health, Settings and Sign out for a Friend', async () => {
    stubApi('friend')
    renderApp('/live/nba')
    await screen.findByRole('link', { name: /nba/i })

    const menu = openUserMenu()

    expect(within(menu).getByText(/dana/)).toBeInTheDocument()
    expect(within(menu).getByRole('menuitemradio', { name: 'Me' })).toBeChecked()
    expect(within(menu).getByRole('menuitem', { name: /all contests/i })).toHaveAttribute('href', '/sport/nba')
    expect(within(menu).getByRole('menuitem', { name: /history/i })).toHaveAttribute('href', '/history')
    expect(within(menu).getByRole('menuitem', { name: /health/i })).toHaveAttribute('href', '/health')
    expect(within(menu).getByRole('menuitem', { name: /settings/i })).toHaveAttribute('href', '/settings')
    expect(within(menu).getByRole('menuitem', { name: /sign out/i })).toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: /admin/i })).not.toBeInTheDocument()
  })

  it('adds Admin for an Owner', async () => {
    stubApi('owner')
    renderApp('/settings')
    await screen.findByRole('link', { name: /nba/i })

    const menu = openUserMenu()

    expect(within(menu).getByRole('menuitem', { name: /admin/i })).toHaveAttribute('href', '/admin/users')
  })

  it('points All contests at the first available sport when no sport is being viewed', async () => {
    stubApi('friend')
    renderApp('/settings')
    await screen.findByRole('link', { name: /nba/i })

    const menu = openUserMenu()

    expect(within(menu).getByRole('menuitem', { name: /all contests/i })).toHaveAttribute('href', '/sport/nba')
  })

  it('follows the sport being viewed for All contests', async () => {
    stubApi('friend')
    renderApp('/sport/mlb')
    await screen.findByRole('link', { name: /mlb/i })

    const menu = openUserMenu()

    expect(within(menu).getByRole('menuitem', { name: /all contests/i })).toHaveAttribute('href', '/sport/mlb')
  })

  it('signs out from the menu', async () => {
    stubApi('friend')
    renderApp('/settings')
    await screen.findByRole('link', { name: /nba/i })

    fireEvent.click(within(openUserMenu()).getByRole('menuitem', { name: /sign out/i }))

    expect(await screen.findByRole('heading', { name: /sign in/i })).toBeInTheDocument()
  })
})

describe('top bar slot', () => {
  it('renders what a route puts into it inside the bar', async () => {
    stubApi('friend')
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/x']}>
          <AuthProvider>
            <ProfileProvider>
              <Routes>
                <Route element={<AppShell />}>
                  <Route path="/x" element={<TopBarSlot>CASH 179.75</TopBarSlot>} />
                </Route>
              </Routes>
            </ProfileProvider>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(await within(screen.getByRole('banner')).findByText('CASH 179.75')).toBeInTheDocument()
  })
})

describe('browser tab title', () => {
  it('names the app', () => {
    expect(indexHtml).toMatch(/<title>DK Dashboard<\/title>/)
  })
})
