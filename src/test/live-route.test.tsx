import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import { useState, type ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
// Exported by the dk_results producer; provenance in public/mock/PRODUCER_FIXTURE.md.
import producerSnapshot from '../../public/mock/snapshots/live-2026-10-03T20-48-31Z.json'
import { TopBarSlotContext } from '../context/TopBarSlotContext'
import Live from '../routes/Live'

// The Live route as a whole: states where there is nothing to render, the plain-language rules,
// and edge cases of the producer fixture (no primary contest, missing sections, empty standings).
// cfb carries `metrics.threat`; mlb carries no `metrics` at all (the missing-metrics variant).
// The producer fixture has no VIP lineups, so tests that need them inject minimal ones.

const SNAPSHOT_PATH = 'snapshots/live-2026-10-03T20-48-31Z.json'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any

function load(): Json {
  return structuredClone(producerSnapshot)
}

function contestOf(snapshot: Json, sport = 'cfb'): Json {
  return snapshot.sports[sport].contests[0]
}

function setPlayers(snapshot: Json, players: Json[], sport = 'cfb') {
  snapshot.sports[sport].players = players.map((row, index) => ({
    player_key: `test:${index}`,
    team: 'FSU',
    position: 'QB',
    roster_positions: ['QB'],
    matchup: 'vs. MIZZ',
    salary: 5000,
    ownership_pct: 10,
    fantasy_points: 10,
    value: 2,
    game_status: 'In-Progress',
    ...row,
  }))
}

interface VipSpec {
  key: string
  name: string
  /** Lineup player names; each becomes a players_live row unless `liveRows` is given. */
  players?: string[]
  liveRows?: Json[]
  ownLeft?: number
}

function setVips(snapshot: Json, vips: VipSpec[]) {
  contestOf(snapshot).vip_lineups = vips.map((vip) => ({
    entry_key: vip.key,
    display_name: vip.name,
    slots: (vip.players ?? []).map((player_name) => ({ slot: 'FLEX', player_name })),
    players_live:
      vip.liveRows ?? (vip.players ?? []).map((player_name) => ({ slot: 'FLEX', player_name, game_status: 'In-Progress' })),
    payout_cents: null,
    live: { updated_at: '2026-10-03T20:48:00Z', ownership_remaining_pct: vip.ownLeft },
  }))
}

function setTrains(snapshot: Json, trains: Array<{ id: string; size: number; players: string[] }>) {
  contestOf(snapshot).train_clusters = trains.map((train, index) => ({
    cluster_id: train.id,
    user_count: train.size,
    rank: index + 1,
    points: 100,
    pmr: 50,
    lineup_signature: train.players.join('|'),
    entry_keys: [],
  }))
}
/* eslint-enable @typescript-eslint/no-explicit-any */

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  cleanup()
})

function TopBar({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  return (
    <>
      <header>
        <div ref={setSlot} />
      </header>
      <TopBarSlotContext.Provider value={slot}>{children}</TopBarSlotContext.Provider>
    </>
  )
}

async function renderLive(snapshot: unknown, path = '/live/cfb') {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/latest') || url.includes('/mock/latest.json')) {
        return new Response(
          JSON.stringify({
            latest_snapshot_path: SNAPSHOT_PATH,
            snapshot_at: '2026-10-03T20:48:31Z',
            generated_at: '2026-10-03T20:48:31Z',
            available_sports: ['cfb', 'golf', 'mlb'],
            manifest_today_path: 'manifest/2026-10-03.json',
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
        <TopBar>
          <Routes>
            <Route path="/live/:sport" element={<Live />} />
          </Routes>
        </TopBar>
      </MemoryRouter>
    </QueryClientProvider>,
  )

  const sport = path.split('/')[2].split('?')[0]
  await screen.findByRole('heading', { name: new RegExp(`live: ${sport}`, 'i') })
}

/** No developer notes, issue links or internal identifiers anywhere on the page. */
function expectNoDeveloperDetails() {
  const text = document.body.textContent ?? ''
  expect(text).not.toMatch(/dk_results|#156|feed does not provide/i)
  expect(text).not.toMatch(/contest key|contest id|selection reason|explicit_id|configured (key|id)/i)
  expect(text).not.toMatch(/\/sport\//)
  expect(text).not.toMatch(/196178015|196293731/)
  for (const link of screen.queryAllByRole('link')) {
    expect(link).not.toHaveAttribute('href', expect.stringContaining('github.com'))
  }
}

describe('nothing to render', () => {
  it('says the snapshot format is unsupported for a schema version other than 3', async () => {
    const snapshot = load()
    snapshot.schema_version = 2

    await renderLive(snapshot)

    expect(screen.getByText(/this snapshot uses an unsupported format \(version 2\)/i)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expectNoDeveloperDetails()
  })

  it('says the sport is not in the snapshot', async () => {
    await renderLive(load(), '/live/nba')

    expect(screen.getByText(/this snapshot has no NBA data/i)).toBeInTheDocument()
    expectNoDeveloperDetails()
  })

  it('says why the view is empty when the sport has no primary contest, and links to all contests', async () => {
    const snapshot = load()
    delete snapshot.sports.cfb.primary_contest

    await renderLive(snapshot)

    expect(screen.getByText(/no primary contest is set for CFB/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /all CFB contests/i })).toHaveAttribute('href', '/sport/cfb')
    expectNoDeveloperDetails()
  })

  it('says the primary contest is missing from the snapshot without naming its key or id', async () => {
    const snapshot = load()
    snapshot.sports.cfb.primary_contest.contest_key = 'cfb:777'
    snapshot.sports.cfb.primary_contest.contest_id = '777'

    await renderLive(snapshot)

    expect(screen.getByText(/the primary contest for CFB is not in this snapshot/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /all CFB contests/i })).toHaveAttribute('href', '/sport/cfb')
    expect(document.body).not.toHaveTextContent('777')
    expectNoDeveloperDetails()
  })
})

describe('hot and cold markers', () => {
  function playersTable() {
    return screen.getByRole('table', { name: /players/i })
  }

  function playerRow(name: string) {
    return within(playersTable()).getByRole('row', { name: new RegExp(name) })
  }

  /** A lineup player card: the list item holding the player's name. */
  function lineupCard(name: string) {
    const card = screen.getByText(name, { selector: 'li *' }).closest('li')
    if (!(card instanceof HTMLElement)) throw new Error(`No lineup card for ${name}`)
    return within(card)
  }

  function iconSnapshot(): Json {
    const snapshot = load()
    setPlayers(snapshot, [
      { name: 'Hot Guy', value_icon: 'fire' },
      { name: 'Cold Guy', value_icon: 'ice' },
      { name: 'Plain Guy' },
    ])
    setVips(snapshot, [
      {
        key: 'vip-a',
        name: 'First VIP',
        liveRows: [
          { slot: 'QB', player_name: 'Hot Guy', game_status: 'In-Progress', value_icon: 'fire' },
          { slot: 'RB', player_name: 'Cold Guy', game_status: 'In-Progress', value_icon: 'ice' },
          { slot: 'WR', player_name: 'Plain Guy', game_status: 'In-Progress' },
        ],
      },
    ])
    setTrains(snapshot, [{ id: 'train-1', size: 9, players: ['Hot Guy', 'Cold Guy', 'Plain Guy'] }])
    return snapshot
  }

  it('marks players in the Players table with the DraftKings icon the feed provides', async () => {
    await renderLive(iconSnapshot())

    expect(within(playerRow('Hot Guy')).getByRole('img', { name: /hot/i })).toHaveTextContent('🔥')
    expect(within(playerRow('Cold Guy')).getByRole('img', { name: /cold/i })).toHaveTextContent('❄️')
    expect(within(playerRow('Plain Guy')).queryByRole('img')).not.toBeInTheDocument()
  })

  it('marks VIP lineup players with the icon the feed provides', async () => {
    await renderLive(iconSnapshot(), '/live/cfb?view=vips')

    expect(lineupCard('Hot Guy').getByRole('img', { name: /hot/i })).toHaveTextContent('🔥')
    expect(lineupCard('Cold Guy').getByRole('img', { name: /cold/i })).toHaveTextContent('❄️')
    expect(lineupCard('Plain Guy').queryByRole('img')).not.toBeInTheDocument()
  })

  it('marks Train lineup players with the icon from the player pool', async () => {
    await renderLive(iconSnapshot(), '/live/cfb?view=trains')

    expect(lineupCard('Hot Guy').getByRole('img', { name: /hot/i })).toHaveTextContent('🔥')
    expect(lineupCard('Cold Guy').getByRole('img', { name: /cold/i })).toHaveTextContent('❄️')
    expect(lineupCard('Plain Guy').queryByRole('img')).not.toBeInTheDocument()
  })

  it('shows no markers anywhere when the feed provides no value icon', async () => {
    const snapshot = load()
    setVips(snapshot, [{ key: 'vip-a', name: 'First VIP', players: ['Ashton Daniels', 'Ousmane Kromah'] }])

    for (const path of ['/live/cfb', '/live/cfb?view=vips', '/live/cfb?view=trains']) {
      await renderLive(snapshot, path)
      expect(document.body.textContent).not.toMatch(/🔥|❄️/)
      expect(screen.queryByRole('img', { name: /hot|cold/i })).not.toBeInTheDocument()
      cleanup()
    }
  })
})
