import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
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

const notFound = () =>
  new Response(JSON.stringify({ error: { code: 'not_found', message: 'Not found' } }), { status: 404 })

const unauthenticated = () =>
  new Response(JSON.stringify({ error: { code: 'unauthenticated', message: 'Authentication required.' } }), {
    status: 401,
  })

const csrf = () => new Response(JSON.stringify({ csrf_token: 'csrf_1' }), { status: 200 })

function user(overrides: { role?: string; must_change_password?: boolean } = {}) {
  return { id: 'u1', username: 'friend', role: 'friend', must_change_password: false, ...overrides }
}

it('shows the server message and stays on the sign-in page when login fails', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/auth/me')) return unauthenticated()
      if (url.includes('/api/auth/csrf')) return csrf()
      if (url.includes('/api/auth/login')) {
        return new Response(
          JSON.stringify({ error: { code: 'invalid_credentials', message: 'Wrong username or password.' } }),
          { status: 401 },
        )
      }
      return notFound()
    }),
  )

  renderApp('/login')
  fireEvent.change(await screen.findByLabelText('Username'), { target: { value: 'friend' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'not-the-password' } })
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

  expect(await screen.findByText('Wrong username or password.')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument()
})

it('signs in and leaves the login page when credentials are accepted', async () => {
  let signedIn = false
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/auth/me')) {
        return signedIn ? new Response(JSON.stringify({ user: user() }), { status: 200 }) : unauthenticated()
      }
      if (url.includes('/api/auth/csrf')) return csrf()
      if (url.includes('/api/auth/login')) {
        signedIn = true
        return new Response(JSON.stringify({ user: user() }), { status: 200 })
      }
      return notFound()
    }),
  )

  renderApp('/login')
  fireEvent.change(await screen.findByLabelText('Username'), { target: { value: 'friend' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'a-good-password' } })
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

  expect(await screen.findByRole('button', { name: /user menu/i })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: /sign in/i })).not.toBeInTheDocument()
})

it('asks for a current password only when the password change is voluntary', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/api/auth/me')) {
        return new Response(JSON.stringify({ user: user() }), { status: 200 })
      }
      return notFound()
    }),
  )

  renderApp('/change-password')
  expect(await screen.findByRole('heading', { name: /change password/i })).toBeInTheDocument()
  expect(screen.getByLabelText('Current password')).toBeInTheDocument()
  expect(screen.getByLabelText('New password')).toBeInTheDocument()
  expect(screen.getByLabelText('Confirm new password')).toBeInTheDocument()
})

it('validates the new password and signs out from the forced change-password page', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/auth/me')) {
        return new Response(JSON.stringify({ user: user({ must_change_password: true }) }), { status: 200 })
      }
      if (url.includes('/api/auth/csrf')) return csrf()
      if (url.includes('/api/auth/logout')) return new Response(JSON.stringify({ ok: true }), { status: 200 })
      return notFound()
    }),
  )

  renderApp('/latest')
  expect(await screen.findByRole('heading', { name: /change password/i })).toBeInTheDocument()
  expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument()
  expect(screen.getByText(/temporary password must be changed/i)).toBeInTheDocument()

  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'twelve-chars-ok' } })
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'something-else-entirely' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save password' }))
  expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
  expect(await screen.findByRole('heading', { name: /sign in/i })).toBeInTheDocument()
})

it('signs out from the Settings account section', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/auth/me')) {
        return new Response(JSON.stringify({ user: user() }), { status: 200 })
      }
      if (url.includes('/api/auth/csrf')) return csrf()
      if (url.includes('/api/auth/logout')) return new Response(JSON.stringify({ ok: true }), { status: 200 })
      return notFound()
    }),
  )

  renderApp('/settings')
  expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument()
  expect(screen.getByText(/signed in as/i)).toHaveTextContent('Signed in as: friend')
  expect(screen.getByText(/^role:/i)).toHaveTextContent('Role: friend')
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
  expect(await screen.findByRole('heading', { name: /sign in/i })).toBeInTheDocument()
})
