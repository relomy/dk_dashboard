import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import snapshotFixture from '../../public/mock/snapshots/canonical-live-snapshot.v2.json'
import App from '../App'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function renderApp(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

it('redirects unauthenticated users to /login', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/auth/me')) {
        return new Response(
          JSON.stringify({ error: { code: 'unauthenticated', message: 'Authentication required.' } }),
          { status: 401 },
        )
      }
      return new Response(JSON.stringify({ error: { code: 'not_found', message: 'Not found' } }), { status: 404 })
    }),
  )

  renderApp('/latest')
  expect(await screen.findByRole('heading', { name: /sign in/i })).toBeInTheDocument()
})

it('redirects authenticated users with must_change_password to /change-password', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/auth/me')) {
        return new Response(
          JSON.stringify({
            user: {
              id: 'u1',
              username: 'friend',
              role: 'friend',
              must_change_password: true,
            },
          }),
          { status: 200 },
        )
      }
      return new Response(JSON.stringify({ error: { code: 'not_found', message: 'Not found' } }), { status: 404 })
    }),
  )

  renderApp('/latest')
  expect(await screen.findByRole('heading', { name: /change password/i })).toBeInTheDocument()
})

it('allows authenticated friend to reach dashboard routes', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/auth/me')) {
        return new Response(
          JSON.stringify({
            user: {
              id: 'u1',
              username: 'friend',
              role: 'friend',
              must_change_password: false,
            },
          }),
          { status: 200 },
        )
      }
      if (url.includes('/api/latest') || url.includes('/mock/latest.json')) {
        return new Response(
          JSON.stringify({
            latest_snapshot_path: 'snapshots/canonical-live-snapshot.v2.json',
            snapshot_at: '2026-02-13T18:25:00Z',
            generated_at: '2026-02-13T18:25:07Z',
            available_sports: ['nba'],
            manifest_today_path: 'manifest/2026-02-13.json',
          }),
          { status: 200 },
        )
      }

      return new Response(JSON.stringify(snapshotFixture), { status: 200 })
    }),
  )

  renderApp('/latest')
  expect(await screen.findByRole('heading', { name: /latest/i })).toBeInTheDocument()
})

it('clears local auth state when logout request fails', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/auth/me')) {
        return new Response(
          JSON.stringify({
            user: {
              id: 'u1',
              username: 'friend',
              role: 'friend',
              must_change_password: false,
            },
          }),
          { status: 200 },
        )
      }
      if (url.includes('/api/latest') || url.includes('/mock/latest.json')) {
        return new Response(
          JSON.stringify({
            latest_snapshot_path: 'snapshots/canonical-live-snapshot.v2.json',
            snapshot_at: '2026-02-13T18:25:00Z',
            generated_at: '2026-02-13T18:25:07Z',
            available_sports: ['nba'],
            manifest_today_path: 'manifest/2026-02-13.json',
          }),
          { status: 200 },
        )
      }
      if (url.includes('/api/auth/csrf')) {
        return new Response(JSON.stringify({ csrf_token: 'csrf_1' }), { status: 200 })
      }
      if (url.includes('/api/auth/logout')) {
        return new Response(
          JSON.stringify({ error: { code: 'unauthenticated', message: 'Authentication required.' } }),
          { status: 401 },
        )
      }

      return new Response(JSON.stringify(snapshotFixture), { status: 200 })
    }),
  )

  renderApp('/latest')
  expect(await screen.findByRole('heading', { name: /latest/i })).toBeInTheDocument()

  const signOutButtons = screen.getAllByRole('button', { name: /sign out/i })
  fireEvent.click(signOutButtons.at(-1) ?? signOutButtons[0])

  expect(await screen.findByRole('heading', { name: /sign in/i })).toBeInTheDocument()
})
