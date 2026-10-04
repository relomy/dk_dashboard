import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
// Exported by the dk_results producer; provenance in public/mock/PRODUCER_FIXTURE.md.
import producerSnapshot from '../../public/mock/snapshots/live-2026-10-03T20-48-31Z.json'
import Live from '../routes/Live'
import Sport from '../routes/Sport'

vi.mock('../context/ProfileContext', () => ({
  useProfiles: () => ({ activeProfile: { id: 'p1', name: 'Me', rules: {} } }),
}))

const SNAPSHOT_PATH = 'snapshots/live-2026-10-03T20-48-31Z.json'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  cleanup()
})

async function renderRoute(path: string, headingName: RegExp) {
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
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/sport/:sport" element={<Sport />} />
          <Route path="/live/:sport" element={<Live />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  await screen.findByRole('heading', { name: headingName })
}

function playerPool() {
  const heading = screen.getByRole('heading', { name: /^player pool$/i })
  const container = heading.closest('section, .panel')
  if (!(container instanceof HTMLElement)) throw new Error('No player pool section')
  return container
}

/** Reads the player pool table as {header: cell text} records, ignoring column order. */
function poolRecords() {
  const rows = within(playerPool()).getAllByRole('row')
  const headers = within(rows[0]).getAllByRole('columnheader').map((h) => h.textContent ?? '')
  return {
    headers,
    records: rows.slice(1).map((row) => {
      const cells = within(row).getAllByRole('cell').map((c) => c.textContent ?? '')
      return Object.fromEntries(headers.map((h, i) => [h, cells[i]]))
    }),
  }
}

it('Sport pool shows real positions, actual points and ownership with no Projected column', async () => {
  await renderRoute('/sport/mlb', /sport: mlb/i)

  const { headers, records } = poolRecords()
  expect(headers).toEqual(['Name', 'Team', 'Positions', 'Actual', 'Ownership'])

  const fry = records.find((r) => r.Name === 'David Fry')
  expect(fry).toMatchObject({ Team: 'CLE', Positions: '1B', Actual: '0.00', Ownership: '13.25%' })
  expect(records.every((r) => r.Positions !== '-' && r.Positions !== '—')).toBe(true)
})

it('Sport pool and Live pool agree on position, points and ownership for the same players', async () => {
  await renderRoute('/sport/cfb', /sport: cfb/i)
  const sport = poolRecords().records
  cleanup()

  await renderRoute('/live/cfb', /live: cfb/i)
  const live = poolRecords().records

  expect(live.length).toBeGreaterThan(0)
  expect(sport.map((r) => r.Name)).toEqual(live.map((r) => r.Player))
  for (const row of live) {
    const match = sport.find((r) => r.Name === row.Player)
    expect(match).toMatchObject({
      Positions: row.Position,
      Actual: row.Points,
      Ownership: row['Own%'],
    })
  }
  const daniels = sport.find((r) => r.Name === 'Ashton Daniels')
  expect(daniels).toMatchObject({ Positions: 'QB', Actual: '18.16', Ownership: '24.02%' })
})
