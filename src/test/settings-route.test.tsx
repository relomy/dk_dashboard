import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import App from '../App'

afterEach(() => {
  vi.restoreAllMocks()
})

it('supports add/edit/delete profiles and user menu active profile switching', async () => {
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

  const openProfileMenu = () => {
    fireEvent.pointerDown(screen.getByRole('button', { name: /user menu/i }), { button: 0, ctrlKey: false })
    return screen.getByRole('menu')
  }

  await screen.findByRole('button', { name: /user menu/i })
  const initialMenu = openProfileMenu()
  expect(within(initialMenu).getByRole('menuitemradio', { name: 'Me' })).toBeChecked()
  fireEvent.keyDown(initialMenu, { key: 'Escape' })

  fireEvent.change(screen.getByLabelText(/profile name/i), { target: { value: 'Alex' } })
  fireEvent.change(screen.getByLabelText(/match rule: contains/i), { target: { value: 'alex' } })
  fireEvent.change(screen.getByLabelText(/match rule: username/i), { target: { value: 'alex_user' } })
  fireEvent.click(screen.getByRole('button', { name: /add profile/i }))

  const menuAfterAdd = openProfileMenu()
  expect(await within(menuAfterAdd).findByRole('menuitemradio', { name: 'Alex' })).not.toBeChecked()

  fireEvent.click(within(menuAfterAdd).getByRole('menuitemradio', { name: 'Alex' }))

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

  const menuAfterDelete = openProfileMenu()
  expect(within(menuAfterDelete).queryByRole('menuitemradio', { name: 'Alex' })).not.toBeInTheDocument()
  expect(within(menuAfterDelete).getByRole('menuitemradio', { name: 'Me' })).toBeChecked()
})
