import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { expect, it, vi } from 'vitest'

vi.mock('../lib/env', () => ({
  config: {
    apiBaseUrl: '',
    useMock: true,
    mockSnapshotOnly: true,
    mockSnapshotPath: 'snapshots/canonical-live-snapshot.v3.json',
  },
}))

vi.mock('../context/ProfileContext', () => ({
  useProfiles: () => ({
    activeProfile: {
      id: 'p1',
      name: 'Me',
      rules: {},
    },
  }),
}))

it('disables history with clear message in snapshot-only mock mode', async () => {
  const fetchSpy = vi.fn()
  vi.stubGlobal('fetch', fetchSpy)

  const { default: History } = await import('../routes/History')
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/history']}>
        <Routes>
          <Route path="/history" element={<History />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )

  expect(await screen.findByText(/history requires manifest files/i)).toBeInTheDocument()
  expect(fetchSpy).not.toHaveBeenCalled()
})
