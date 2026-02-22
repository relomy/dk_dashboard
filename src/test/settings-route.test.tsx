import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import App from '../App'

afterEach(() => {
  vi.restoreAllMocks()
})

it('supports add/edit/delete profiles and header active profile switching', async () => {
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
      if (url.includes('/api/auth/logout')) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      }
      if (url.includes('/api/auth/csrf')) {
        return new Response(JSON.stringify({ csrf_token: 'csrf_1' }), { status: 200 })
      }
      return new Response(JSON.stringify({ error: { code: 'not_found', message: 'Not found' } }), { status: 404 })
    }),
  )

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/settings']}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  )

  const activeProfileSelect = await screen.findByLabelText(/active profile/i)
  expect(within(activeProfileSelect).getByRole('option', { name: 'Me' })).toBeInTheDocument()

  fireEvent.change(screen.getByLabelText(/profile name/i), { target: { value: 'Alex' } })
  fireEvent.change(screen.getByLabelText(/match rule: contains/i), { target: { value: 'alex' } })
  fireEvent.change(screen.getByLabelText(/match rule: username/i), { target: { value: 'alex_user' } })
  fireEvent.click(screen.getByRole('button', { name: /add profile/i }))

  expect(await within(activeProfileSelect).findByRole('option', { name: 'Alex' })).toBeInTheDocument()

  fireEvent.change(activeProfileSelect, {
    target: { value: screen.getByRole('option', { name: 'Alex' }).getAttribute('value') },
  })

  const profilesList = screen.getByRole('list')
  const alexListItem = within(profilesList).getByText('Alex').closest('li')
  if (!alexListItem) {
    throw new Error('Alex profile list item not found')
  }
  expect(alexListItem).toHaveTextContent('Alex (active)')

  fireEvent.click(within(alexListItem).getByRole('button', { name: /edit/i }))
  fireEvent.change(screen.getByLabelText(/match rule: exact/i), { target: { value: 'Alex Entry' } })
  fireEvent.click(screen.getByRole('button', { name: /save profile/i }))

  expect(screen.getByText(/exact: Alex Entry/i)).toBeInTheDocument()

  const alexAfterEdit = within(profilesList).getByText('Alex').closest('li')
  if (!alexAfterEdit) {
    throw new Error('Edited Alex profile list item not found')
  }

  fireEvent.click(within(alexAfterEdit).getByRole('button', { name: /delete/i }))

  expect(screen.queryByText(/^Alex$/)).not.toBeInTheDocument()
  expect(within(activeProfileSelect).queryByRole('option', { name: 'Alex' })).not.toBeInTheDocument()
})
