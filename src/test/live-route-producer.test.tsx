import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
// Exported by the dk_results producer; provenance in public/mock/PRODUCER_FIXTURE.md.
import producerSnapshot from '../../public/mock/snapshots/live-2026-10-03T20-48-31Z.json'
import Live from '../routes/Live'

const SNAPSHOT_PATH = 'snapshots/live-2026-10-03T20-48-31Z.json'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  cleanup()
})

async function renderLiveAgainstProducerSnapshot(sport: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/latest') || url.includes('/mock/latest.json')) {
        return new Response(
          JSON.stringify({
            available_sports: ['cfb', 'golf', 'mlb'],
            generated_at: '2026-10-03T20:48:31Z',
            latest_snapshot_path: SNAPSHOT_PATH,
            manifest_today_path: 'manifest/2026-10-03.json',
            snapshot_at: '2026-10-03T20:48:31Z',
          }),
          { status: 200 },
        )
      }
      return new Response(JSON.stringify(producerSnapshot), { status: 200 })
    }),
  )

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/live/${sport}`]}>
        <Routes>
          <Route path="/live/:sport" element={<Live />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )

  await screen.findByRole('heading', { name: new RegExp(`live: ${sport}`, 'i') })
}

function panel(headingName: RegExp) {
  const heading = screen.getByRole('heading', { name: headingName })
  const container = heading.closest('.panel')
  if (!(container instanceof HTMLElement)) throw new Error(`No panel for ${headingName}`)
  return container
}

it('renders the Live route against the producer-exported v3 snapshot', async () => {
  await renderLiveAgainstProducerSnapshot('mlb')

  const contest = panel(/primary contest/i)
  expect(within(contest).getByText('MLB Single Entry $5 Double Up')).toBeInTheDocument()
  expect(within(contest).getByText(/contest key: mlb:196293731/i)).toBeInTheDocument()

  const trainRows = within(panel(/train finder/i)).getAllByRole('row')
  expect(trainRows).toHaveLength(1 + 17)

  const standings = panel(/^standings$/i)
  expect(within(standings).getByText('nycgator12')).toBeInTheDocument()
})
