import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { load } from './liveHarness'

afterEach(() => {
  vi.unstubAllGlobals()
  cleanup()
})

function renderApp(role: 'owner' | 'friend', path: string) {
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
      if (url.includes('/api/latest')) {
        return new Response(
          JSON.stringify({
            latest_snapshot_path: 'snapshots/live.json',
            snapshot_at: '2026-10-04T18:41:34Z',
            generated_at: '2026-10-04T18:41:34Z',
            available_sports: ['golf', 'nfl'],
            manifest_today_path: 'manifest/2026-10-04.json',
          }),
          { status: 200 },
        )
      }
      if (url.includes('/api/snapshot')) return new Response(JSON.stringify(load()), { status: 200 })
      return new Response(JSON.stringify({ error: { code: 'not_found', message: 'Not found' } }), { status: 404 })
    }),
  )
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('/shifts/:sport', () => {
  it('shows the Shifts page to the owner inside the app shell', async () => {
    renderApp('owner', '/shifts/nfl')
    expect(await screen.findByRole('heading', { name: 'Shifts' })).toBeTruthy()
    expect(screen.getByText('DK/LIVE')).toBeTruthy()
    expect(await screen.findByText(/nothing has moved since you last looked/i)).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Summary', selected: true })).toBeTruthy()
  })

  it('sends a non-owner to the landing page, as for an unknown route', async () => {
    renderApp('friend', '/shifts/nfl')
    await screen.findByText('DK/LIVE')
    expect(screen.queryByRole('heading', { name: 'Shifts' })).toBeNull()
    expect(screen.queryByText(/shifts are not available/i)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Mark as seen' })).toBeNull()
  })
})
