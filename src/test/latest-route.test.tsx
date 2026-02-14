import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import Latest from '../routes/Latest'

const latestPayload = {
  latest_snapshot_path: 'snapshots/2026-02-13T18-25-00Z.json',
  snapshot_at: '2026-02-13T18:25:00Z',
  generated_at: '2026-02-13T18:25:07Z',
  available_sports: ['nba'],
  manifest_today_path: 'manifest/2026-02-13.json',
}

const snapshotPayload = {
  schema_version: 1,
  snapshot_at: '2026-02-13T18:25:00Z',
  generated_at: '2026-02-13T18:25:07Z',
  sports: {
    nba: {
      status: 'ok',
      updated_at: '2026-02-13T18:25:00Z',
      contests: [],
      players: [],
    },
  },
}

afterEach(() => {
  vi.restoreAllMocks()
})

it('renders latest snapshot summary', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/latest')) {
        return new Response(JSON.stringify(latestPayload), { status: 200 })
      }
      return new Response(JSON.stringify(snapshotPayload), { status: 200 })
    }),
  )

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/latest']}>
        <Routes>
          <Route path="/latest" element={<Latest />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )

  fireEvent.change(screen.getByLabelText(/access key/i), { target: { value: 'test-key' } })
  fireEvent.click(screen.getByRole('button', { name: /save key/i }))

  expect(await screen.findByText(/last updated:/i)).toBeInTheDocument()
})
