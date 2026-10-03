import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import App from '../App'

afterEach(() => {
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

it('blocks friend users from /admin/users', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/auth/me')) {
        return new Response(
          JSON.stringify({
            user: {
              id: 'u_friend',
              username: 'friend',
              role: 'friend',
              must_change_password: false,
            },
          }),
          { status: 200 },
        )
      }
      if (url.includes('/api/latest')) {
        return new Response(
          JSON.stringify({
            latest_snapshot_path: 'snapshots/canonical-live-snapshot.v3.json',
            snapshot_at: '2026-02-13T18:25:00Z',
            generated_at: '2026-02-13T18:25:07Z',
            available_sports: ['nba'],
            manifest_today_path: 'manifest/2026-02-13.json',
          }),
          { status: 200 },
        )
      }
      if (url.includes('/api/snapshot')) {
        return new Response(
          JSON.stringify({
            schema_version: 3,
            snapshot_at: '2026-02-13T18:25:00Z',
            generated_at: '2026-02-13T18:25:07Z',
            sports: {},
          }),
          { status: 200 },
        )
      }

      return new Response(JSON.stringify({ error: { code: 'not_found', message: 'Not found' } }), { status: 404 })
    }),
  )

  renderApp('/admin/users')
  expect(await screen.findByRole('heading', { name: /latest/i })).toBeInTheDocument()
})

it('allows owner users to view and create users from /admin/users', async () => {
  const fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.includes('/api/auth/me')) {
      return new Response(
        JSON.stringify({
          user: {
            id: 'u_owner',
            username: 'owner',
            role: 'owner',
            must_change_password: false,
          },
        }),
        { status: 200 },
      )
    }
    if (url.includes('/api/admin/users') && (!init?.method || init.method === 'GET')) {
      return new Response(
        JSON.stringify({
          users: [
            {
              id: 'u_owner',
              username: 'owner',
              role: 'owner',
              is_active: true,
              must_change_password: false,
              last_login_at: null,
            },
          ],
        }),
        { status: 200 },
      )
    }
    if (url.includes('/api/admin/users') && init?.method === 'POST') {
      return new Response(
        JSON.stringify({
          user: {
            id: 'u_friend',
            username: 'friend_1',
            role: 'friend',
            is_active: true,
            must_change_password: true,
            temp_password_expires_at: '2026-02-23T00:00:00Z',
          },
          temporary_password: 'TempPass123!ABC',
        }),
        { status: 201 },
      )
    }
    if (url.includes('/api/auth/csrf')) {
      return new Response(JSON.stringify({ csrf_token: 'csrf_1' }), { status: 200 })
    }

    return new Response(JSON.stringify({ error: { code: 'not_found', message: 'Not found' } }), { status: 404 })
  })
  vi.stubGlobal('fetch', fetchSpy)

  renderApp('/admin/users')
  expect(await screen.findByRole('heading', { name: /admin users/i })).toBeInTheDocument()
  expect(await screen.findByRole('table')).toBeInTheDocument()

  fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'friend_1' } })
  fireEvent.change(screen.getByLabelText(/role/i), { target: { value: 'friend' } })
  fireEvent.click(screen.getByRole('button', { name: /create user/i }))

  expect(await screen.findByText(/temporary password/i)).toBeInTheDocument()
  expect(fetchSpy).toHaveBeenCalled()
})
