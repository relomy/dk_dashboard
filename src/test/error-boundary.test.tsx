import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import ErrorBoundary from '../components/ErrorBoundary'

afterEach(() => {
  vi.restoreAllMocks()
  cleanup()
})

function Boom(): never {
  throw new Error('bad shape')
}

it('shows a fallback instead of unmounting when a child throws', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})

  render(
    <ErrorBoundary label="Live">
      <Boom />
    </ErrorBoundary>,
  )

  expect(screen.getByRole('alert')).toHaveTextContent(/could not be displayed/i)
})
