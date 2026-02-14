import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { expect, it } from 'vitest'
import App from '../App'

it('renders latest route', () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/latest']}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  )

  expect(screen.getByRole('heading', { name: /enter access key/i })).toBeInTheDocument()
})
