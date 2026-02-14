import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { expect, it } from 'vitest'
import App from '../App'

it('renders latest route', () => {
  render(
    <MemoryRouter initialEntries={['/latest']}>
      <App />
    </MemoryRouter>,
  )

  expect(screen.getByRole('heading', { name: /latest/i })).toBeInTheDocument()
})
