import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
// Exported by the dk_results producer; provenance in public/mock/PRODUCER_FIXTURE.md.
import producerSnapshot from '../../public/mock/snapshots/live-2026-10-04T18-41-34Z.json'
import Live from '../routes/Live'
import Sport from '../routes/Sport'

vi.mock('../context/ProfileContext', () => ({
  useProfiles: () => ({ activeProfile: { id: 'p1', name: 'Me', rules: {} } }),
}))

const SNAPSHOT_PATH = 'snapshots/live-2026-10-04T18-41-34Z.json'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  cleanup()
})

async function renderRoute(path: string, headingName: RegExp, snapshot: unknown = producerSnapshot) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/latest') || url.includes('/mock/latest.json')) {
        return new Response(
          JSON.stringify({
            available_sports: ['golf', 'nfl'],
            generated_at: '2026-10-04T18:41:34Z',
            latest_snapshot_path: SNAPSHOT_PATH,
            manifest_today_path: 'manifest/2026-10-04.json',
            snapshot_at: '2026-10-04T18:41:34Z',
          }),
          { status: 200 },
        )
      }
      return new Response(JSON.stringify(snapshot), { status: 200 })
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
  return screen.getByRole('region', { name: /^player pool$/i })
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

/** Reads the Live Players table as {header: cell text} records; the player cell reads "<team><name>". */
function livePlayersRecords() {
  const rows = within(screen.getByRole('table', { name: /players/i })).getAllByRole('row')
  const headers = within(rows[0])
    .getAllByRole('columnheader')
    .map((h) => (h.textContent ?? '').replace(/[↑↓]/g, '').trim())
  return rows.slice(1).map((row) => {
    const cells = within(row).getAllByRole('cell').map((c) => c.textContent ?? '')
    return Object.fromEntries(headers.map((h, i) => [h, cells[i]]))
  })
}

it('Sport pool shows real positions, actual points and ownership with no Projected column', async () => {
  await renderRoute('/sport/golf', /sport: golf/i)

  const { headers, records } = poolRecords()
  expect(headers).toEqual(['Name', 'Team', 'Positions', 'Actual', 'Ownership'])

  const kohles = records.find((r) => r.Name === 'Ben Kohles')
  expect(kohles).toMatchObject({ Team: 'Golf', Positions: 'G', Actual: '81.50', Ownership: '60.53%' })
  expect(records.every((r) => r.Positions !== '-' && r.Positions !== '—')).toBe(true)
})

it('Sport cards render the producer roster slots and names', async () => {
  await renderRoute('/sport/nfl', /sport: nfl/i)
  const lists = screen.getAllByRole('list')
  expect(lists.some((list) => within(list).queryByText('Trevor Lawrence'))).toBe(true)
  expect(lists.some((list) => within(list).queryByText('QB'))).toBe(true)
})

it('Sport cards hide player details for a locked roster slot', async () => {
  const snapshot = structuredClone(producerSnapshot)
  Object.assign(snapshot.sports.nfl.contests[0].vip_lineups[0].players_live[0], {
    is_locked: true, player_name: 'Hidden player', salary: 9900,
  })
  await renderRoute('/sport/nfl', /sport: nfl/i, snapshot)
  expect(screen.getAllByText('Locked 🔒').length).toBeGreaterThan(0)
  expect(screen.queryByText('Hidden player')).not.toBeInTheDocument()
  expect(screen.queryByText('9900')).not.toBeInTheDocument()
})

it('Sport cards never use another entry cashing evidence and leave missing evidence unavailable', async () => {
  const snapshot = structuredClone(producerSnapshot)
  const contest = snapshot.sports.nfl.contests[0]
  contest.vip_lineups = [contest.vip_lineups[0]]
  Object.assign(contest, {
    standings: [{ entry_key: 'someone-else', is_cashing: true, payout_cents: 12000 }],
    metrics: { updated_at: snapshot.generated_at, distance_to_cash: { per_vip: [{ vip_entry_key: 'someone-else', points_delta: 30 }] } },
  })
  await renderRoute('/sport/nfl', /sport: nfl/i, snapshot)
  expect(screen.queryByText('Cashing')).not.toBeInTheDocument()
  expect(screen.queryByText('Outside cash')).not.toBeInTheDocument()
})

it('Sport pool and Live pool agree on position, points and ownership for the same players', async () => {
  await renderRoute('/sport/nfl', /sport: nfl/i)
  const sport = poolRecords().records
  cleanup()

  await renderRoute('/live/nfl', /live: nfl/i)
  const live = livePlayersRecords()

  expect(live.length).toBeGreaterThan(0)
  expect(sport.map((r) => `${r.Team}${r.Name}`)).toEqual(live.map((r) => r.Player))
  for (const row of live) {
    const match = sport.find((r) => `${r.Team}${r.Name}` === row.Player)
    expect(match).toMatchObject({
      Positions: row.Pos,
      Actual: row.Pts,
      Ownership: row.Own,
    })
  }
  const lawrence = sport.find((r) => r.Name === 'Trevor Lawrence')
  expect(lawrence).toMatchObject({ Positions: 'QB', Actual: '9.44', Ownership: '70.86%' })
})
