import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import App from '../App'

afterEach(() => {
  vi.restoreAllMocks()
})

it('renders latest route', async () => {
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

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/latest']}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  )

  expect(await screen.findByRole('heading', { name: /sign in/i })).toBeInTheDocument()
})
