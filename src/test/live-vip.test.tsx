import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState, type ReactNode } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
// Exported by the dk_results producer; provenance in public/mock/PRODUCER_FIXTURE.md.
import producerSnapshot from '../../public/mock/snapshots/live-2026-10-03T20-48-31Z.json'
import { TopBarSlotContext } from '../context/TopBarSlotContext'
import Live from '../routes/Live'

// The Live VIP view: rail rows, the focused VIP's stats, cash-line meter and grouped lineup.
// The producer fixture has no VIP lineups (cfb: field of 229, cash line at rank 98), so tests inject them.

const SNAPSHOT_PATH = 'snapshots/live-2026-10-03T20-48-31Z.json'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any

function load(): Json {
  return structuredClone(producerSnapshot)
}

function contestOf(snapshot: Json, sport = 'cfb'): Json {
  return snapshot.sports[sport].contests[0]
}

interface VipSpec {
  key: string
  name: string
  rank?: number
  points?: number
  pmr?: number
  ownLeft?: number
  /** Points distance to cash (the per-VIP metric). */
  delta?: number
  /** Lineup ownership, under either field name. */
  lineupOwn?: number
  lineupOwnField?: 'lineup_ownership_pct' | 'total_ownership_pct'
  players?: Json[] | null
}

const ROW = {
  slot: 'QB',
  player_name: 'Ashton Daniels',
  ownership_pct: 84.67,
  salary: 3500,
  points: 7.25,
  value: 2.07,
  rt_projection: 21.11,
  time_remaining_display: '38.02',
  stats_text: '1 TD',
  game_status: 'In Progress',
}

function setVips(snapshot: Json, vips: VipSpec[]) {
  const contest = contestOf(snapshot)
  contest.vip_lineups = vips.map((vip) => ({
    entry_key: vip.key,
    display_name: vip.name,
    slots: [{ slot: 'QB', player_name: 'Slot Only Guy' }],
    ...(vip.players === undefined ? { players_live: [ROW] } : { players_live: vip.players }),
    payout_cents: null,
    live: {
      updated_at: '2026-10-03T20:48:00Z',
      current_rank: vip.rank,
      current_points: vip.points,
      pmr: vip.pmr,
      ownership_remaining_pct: vip.ownLeft,
    },
  }))
  contest.metrics.distance_to_cash = {
    per_vip: vips.filter((vip) => vip.delta !== undefined).map((vip) => ({ entry_key: vip.key, points_delta: vip.delta })),
  }
  contest.metrics.ownership_summary = {
    source: 'vip_lineup_players',
    scope: 'vip_lineup',
    per_vip: vips
      .filter((vip) => vip.lineupOwn !== undefined)
      .map((vip) => ({ entry_key: vip.key, [vip.lineupOwnField ?? 'lineup_ownership_pct']: vip.lineupOwn })),
  }
}

const FIRST: VipSpec = {
  key: 'vip-a',
  name: 'First VIP',
  rank: 12,
  points: 140.5,
  pmr: 88.5,
  ownLeft: 210.25,
  delta: 50.25,
  lineupOwn: 445.6,
}
const SECOND: VipSpec = { key: 'vip-b', name: 'Second VIP', rank: 150, points: 90, pmr: 120, ownLeft: 95, delta: -78.5, lineupOwn: 100 }
/* eslint-enable @typescript-eslint/no-explicit-any */

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  cleanup()
})

function stubPhone() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('max-width'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }))
}

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

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>
}

async function renderLive(snapshot: unknown, path = '/live/cfb?view=vips') {
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
          <LocationProbe />
        </TopBar>
      </MemoryRouter>
    </QueryClientProvider>,
  )

  const sport = path.split('/')[2].split('?')[0]
  await screen.findByRole('heading', { name: new RegExp(`live: ${sport}`, 'i') })
}

function location() {
  return screen.getByTestId('location').textContent
}

function rail() {
  return screen.getByRole('navigation', { name: /live views/i })
}

function chips() {
  return screen.getByRole('navigation', { name: /^vips$/i })
}

/** One of the focused VIP's stats, a labelled group. */
function stat(label: string) {
  return within(screen.getByRole('group', { name: label }))
}

describe('rail', () => {
  it('lists each VIP with rank, PMR and signed distance to cash', async () => {
    const snapshot = load()
    setVips(snapshot, [FIRST, SECOND])
    await renderLive(snapshot, '/live/cfb')

    const first = within(rail()).getByRole('link', { name: /First VIP/ })
    expect(first).toHaveTextContent('#12')
    expect(first).toHaveTextContent('88.5 PMR')
    expect(first).toHaveTextContent('+50.25')

    const second = within(rail()).getByRole('link', { name: /Second VIP/ })
    expect(second).toHaveTextContent('#150')
    expect(second).toHaveTextContent('−78.5')
  })

  it('opens a VIP from its rail row and keeps them in the URL', async () => {
    const snapshot = load()
    setVips(snapshot, [FIRST, SECOND])
    await renderLive(snapshot, '/live/cfb')

    fireEvent.click(within(rail()).getByRole('link', { name: /Second VIP/ }))

    expect(location()).toBe('/live/cfb?view=vips&vip=vip-b')
    expect(screen.getByRole('heading', { name: 'Second VIP' })).toBeInTheDocument()
    expect(within(rail()).getByRole('link', { name: /Second VIP/ })).toHaveAttribute('aria-current', 'page')
    expect(within(rail()).getByRole('link', { name: /First VIP/ })).not.toHaveAttribute('aria-current')
  })

  it('still offers the VIPs view when the contest has no VIPs', async () => {
    await renderLive(load(), '/live/cfb')

    fireEvent.click(within(rail()).getByRole('link', { name: /^vips/i }))

    expect(location()).toBe('/live/cfb?view=vips')
    expect(screen.getByText(/no vips are tracked in this contest/i)).toBeInTheDocument()
  })
})

describe('VIP view focus', () => {
  it('focuses the first VIP when the URL names none', async () => {
    const snapshot = load()
    setVips(snapshot, [FIRST, SECOND])
    await renderLive(snapshot)

    expect(screen.getByRole('heading', { name: 'First VIP' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Second VIP' })).not.toBeInTheDocument()
  })

  it('focuses the VIP named in the URL, as for a shared link or a reload', async () => {
    const snapshot = load()
    setVips(snapshot, [FIRST, SECOND])
    await renderLive(snapshot, '/live/cfb?view=vips&vip=vip-b')

    expect(screen.getByRole('heading', { name: 'Second VIP' })).toBeInTheDocument()
  })

  it('falls back to the first VIP for an unknown key', async () => {
    const snapshot = load()
    setVips(snapshot, [FIRST, SECOND])
    await renderLive(snapshot, '/live/cfb?view=vips&vip=nobody')

    expect(screen.getByRole('heading', { name: 'First VIP' })).toBeInTheDocument()
  })

  it('says so when the contest has no VIPs', async () => {
    await renderLive(load())

    expect(screen.getByText(/no vips are tracked in this contest/i)).toBeInTheDocument()
  })
})

describe('VIP stats', () => {
  it('shows rank out of the field size', async () => {
    const snapshot = load()
    setVips(snapshot, [FIRST])
    await renderLive(snapshot)

    expect(stat('Rank').getByText('#12')).toBeInTheDocument()
    expect(stat('Rank').getByText('of 229')).toBeInTheDocument()
  })

  it('shows points and projected points', async () => {
    const snapshot = load()
    setVips(snapshot, [{ ...FIRST, players: [{ ...ROW, points: 10, rt_projection: 30.5 }] }])
    await renderLive(snapshot)

    expect(stat('Points').getByText('140.50')).toBeInTheDocument()
    expect(stat('Points').getByText('proj 30.50')).toBeInTheDocument()
  })

  it('shows a cashing VIP as a green signed distance labelled "cashing"', async () => {
    const snapshot = load()
    setVips(snapshot, [FIRST])
    await renderLive(snapshot)

    expect(stat('vs cash').getByText('+50.25')).toBeInTheDocument()
    expect(stat('vs cash').getByText('cashing')).toBeInTheDocument()
  })

  it('shows a VIP below the line as a signed distance labelled "not cashing"', async () => {
    const snapshot = load()
    setVips(snapshot, [SECOND])
    await renderLive(snapshot)

    expect(stat('vs cash').getByText('−78.5')).toBeInTheDocument()
    expect(stat('vs cash').getByText('not cashing')).toBeInTheDocument()
  })

  it('shows a dash for distance when the feed has none, and still says whether they are cashing', async () => {
    const snapshot = load()
    setVips(snapshot, [{ ...FIRST, delta: undefined }])
    await renderLive(snapshot)

    expect(stat('vs cash').getByText('—')).toBeInTheDocument()
    expect(stat('vs cash').getByText('not cashing')).toBeInTheDocument()
  })

  it('treats a payout as cashing when the feed has no distance to cash', async () => {
    const snapshot = load()
    setVips(snapshot, [{ ...FIRST, delta: undefined }])
    contestOf(snapshot).vip_lineups[0].payout_cents = 100
    await renderLive(snapshot)

    expect(stat('vs cash').getByText('cashing')).toBeInTheDocument()
  })

  it('never says "in the money" or "pts in/out"', async () => {
    const snapshot = load()
    setVips(snapshot, [FIRST, SECOND])
    await renderLive(snapshot)

    expect(screen.queryByText(/in the money/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/pts? in\b|pts? out\b/i)).not.toBeInTheDocument()
  })

  it('shows PMR and ownership remaining', async () => {
    const snapshot = load()
    setVips(snapshot, [FIRST])
    await renderLive(snapshot)

    expect(stat('PMR').getByText('88.5')).toBeInTheDocument()
    expect(stat('PMR').getByText('210.25% own remaining')).toBeInTheDocument()
  })

  it('says ownership remaining is unavailable when the feed omits it', async () => {
    const snapshot = load()
    setVips(snapshot, [{ ...FIRST, ownLeft: undefined, pmr: undefined }])
    await renderLive(snapshot)

    expect(stat('PMR').getByText('—')).toBeInTheDocument()
    expect(stat('PMR').getByText(/own remaining unavailable/i)).toBeInTheDocument()
  })

  it('shows lineup ownership with a chalky hint', async () => {
    const snapshot = load()
    setVips(snapshot, [{ ...FIRST, players: Array.from({ length: 8 }, (_, i) => ({ ...ROW, slot: `S${i}` })) }])
    await renderLive(snapshot)

    expect(stat('Lineup own').getByText('445.6%')).toBeInTheDocument()
    expect(stat('Lineup own').getByText('chalky')).toBeInTheDocument()
  })

  it('hints balanced and contrarian from the average ownership per slot', async () => {
    const players = Array.from({ length: 8 }, (_, i) => ({ ...ROW, slot: `S${i}` }))
    const snapshot = load()
    setVips(snapshot, [
      { ...FIRST, lineupOwn: 240, players },
      { ...SECOND, lineupOwn: 100, players },
    ])
    await renderLive(snapshot)
    expect(stat('Lineup own').getByText('balanced')).toBeInTheDocument()

    cleanup()
    await renderLive(snapshot, '/live/cfb?view=vips&vip=vip-b')
    expect(stat('Lineup own').getByText('contrarian')).toBeInTheDocument()
  })

  it('reads lineup ownership from either field name', async () => {
    const snapshot = load()
    setVips(snapshot, [{ ...FIRST, lineupOwn: 301.5, lineupOwnField: 'total_ownership_pct' }])
    await renderLive(snapshot)

    expect(stat('Lineup own').getByText('301.5%')).toBeInTheDocument()
  })

  it('says lineup ownership is unavailable when the feed omits it', async () => {
    const snapshot = load()
    setVips(snapshot, [{ ...FIRST, lineupOwn: undefined }])
    await renderLive(snapshot)

    expect(stat('Lineup own').getByText('—')).toBeInTheDocument()
    expect(stat('Lineup own').getByText('unavailable')).toBeInTheDocument()
  })
})

describe('cash-line meter', () => {
  it('marks the cash line and places every VIP on the field', async () => {
    const snapshot = load()
    setVips(snapshot, [FIRST, SECOND])
    await renderLive(snapshot)

    const meter = screen.getByRole('img', { name: /cash line/i })
    expect(meter).toHaveAccessibleName(/cash line at rank 98 of 229/i)
    expect(meter).toHaveAccessibleName(/First VIP #12/)
    expect(meter).toHaveAccessibleName(/Second VIP #150/)
    expect(screen.getByText('cash 98')).toBeInTheDocument()
  })

  it('says the meter is unavailable when the feed has no cash line rank', async () => {
    const snapshot = load()
    delete contestOf(snapshot).live_metrics.cash_line.rank_cutoff
    setVips(snapshot, [FIRST])
    await renderLive(snapshot)

    expect(screen.queryByRole('img', { name: /cash line/i })).not.toBeInTheDocument()
    expect(screen.getByText(/cash-line meter unavailable/i)).toBeInTheDocument()
  })
})

describe('lineup', () => {
  const LINEUP = [
    { ...ROW, slot: 'QB', player_name: 'Live Guy', game_status: 'In Progress', points: 12.5, rt_projection: 24.25, value: 4.5, stats_text: '2 TD', ownership_pct: 31.5, time_remaining_display: '21.5' },
    { ...ROW, slot: 'RB', player_name: 'Later Guy', game_status: 'FSU@MIZZ 07:30PM ET', points: 0, rt_projection: 15, value: 0, stats_text: null, ownership_pct: 12, time_remaining_display: null },
    { ...ROW, slot: 'WR', player_name: 'Finished Guy', game_status: 'Final', points: 30, rt_projection: 30, value: 6.5, stats_text: '3 TD', ownership_pct: 55, time_remaining_display: null },
  ]

  function group(name: RegExp) {
    return screen.getByRole('region', { name })
  }

  it('groups the lineup into Playing now, Yet to play and Done', async () => {
    const snapshot = load()
    setVips(snapshot, [{ ...FIRST, players: LINEUP }])
    await renderLive(snapshot)

    expect(within(group(/^playing now/i)).getByText('Live Guy')).toBeInTheDocument()
    expect(within(group(/^yet to play/i)).getByText('Later Guy')).toBeInTheDocument()
    expect(within(group(/^done/i)).getByText('Finished Guy')).toBeInTheDocument()
    expect(within(group(/^done/i)).queryByText('Live Guy')).not.toBeInTheDocument()
    const groupHeadings = screen
      .getAllByRole('region')
      .map((region) => within(region).getByRole('heading').textContent)
      .filter((heading) => /^(playing now|yet to play|done)/i.test(heading ?? ''))
    expect(groupHeadings).toEqual(['Playing now · 1', 'Yet to play · 1', 'Done · 1'])
  })

  it('shows each player slot, points, projection, game clock, ownership, value and stat line', async () => {
    const snapshot = load()
    setVips(snapshot, [{ ...FIRST, players: LINEUP }])
    await renderLive(snapshot)

    const live = within(within(group(/^playing now/i)).getByRole('listitem'))
    expect(live.getByText('QB')).toBeInTheDocument()
    expect(live.getByText('12.50')).toBeInTheDocument()
    expect(live.getByText('proj 24.25')).toBeInTheDocument()
    expect(live.getByText('21.5')).toBeInTheDocument()
    expect(live.getByText('31.5% own')).toBeInTheDocument()
    expect(live.getByText('4.5')).toBeInTheDocument()
    expect(live.getByText('2 TD')).toBeInTheDocument()
  })

  it('trims ownership to two decimals', async () => {
    const snapshot = load()
    setVips(snapshot, [{ ...FIRST, players: [{ ...ROW, ownership_pct: 26.97999999999997 }] }])
    await renderLive(snapshot)

    expect(screen.getByText('26.98% own')).toBeInTheDocument()
  })

  it('hides value for players who have not started and projection for finished ones', async () => {
    const snapshot = load()
    setVips(snapshot, [{ ...FIRST, players: LINEUP }])
    await renderLive(snapshot)

    const later = within(within(group(/^yet to play/i)).getByRole('listitem'))
    expect(later.getByText('proj 15.00')).toBeInTheDocument()
    expect(later.getByText('FSU@MIZZ 07:30PM ET')).toBeInTheDocument()
    expect(later.getByText('—')).toBeInTheDocument()

    const done = within(within(group(/^done/i)).getByRole('listitem'))
    expect(done.getByText('30.00')).toBeInTheDocument()
    expect(done.queryByText(/^proj/)).not.toBeInTheDocument()
    expect(done.getByText('6.5')).toBeInTheDocument()
  })

  it('puts players with no game status in Yet to play', async () => {
    const snapshot = load()
    setVips(snapshot, [{ ...FIRST, players: [{ ...ROW, player_name: 'Unknown Status', game_status: undefined }] }])
    await renderLive(snapshot)

    expect(within(group(/^yet to play/i)).getByText('Unknown Status')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /^playing now/i })).not.toBeInTheDocument()
  })

  it('shows the name-only slots, as yet to play, when the feed has no live details', async () => {
    const snapshot = load()
    setVips(snapshot, [{ ...FIRST, players: null }])
    await renderLive(snapshot)

    expect(within(group(/^yet to play/i)).getByText('Slot Only Guy')).toBeInTheDocument()
  })

  it('says so when the lineup has no players', async () => {
    const snapshot = load()
    setVips(snapshot, [{ ...FIRST, players: [] }])
    await renderLive(snapshot)

    expect(screen.getByText(/no lineup players are available for this vip/i)).toBeInTheDocument()
  })
})

describe('on a phone', () => {
  it('replaces the rail with a chip row that switches VIPs', async () => {
    stubPhone()
    const snapshot = load()
    setVips(snapshot, [FIRST, SECOND])
    await renderLive(snapshot)

    expect(screen.queryByRole('navigation', { name: /live views/i })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'First VIP' })).toBeInTheDocument()
    expect(within(chips()).getByRole('link', { name: /First VIP/ })).toHaveAttribute('aria-current', 'page')

    fireEvent.click(within(chips()).getByRole('link', { name: /Second VIP/ }))

    expect(location()).toBe('/live/cfb?view=vips&vip=vip-b')
    expect(screen.getByRole('heading', { name: 'Second VIP' })).toBeInTheDocument()
    expect(within(chips()).getByRole('link', { name: /Second VIP/ })).toHaveAttribute('aria-current', 'page')
  })

  it('shows each chip with the VIP rank', async () => {
    stubPhone()
    const snapshot = load()
    setVips(snapshot, [FIRST, SECOND])
    await renderLive(snapshot)

    expect(within(chips()).getByRole('link', { name: /First VIP/ })).toHaveTextContent('#12')
    expect(within(chips()).getByRole('link', { name: /Second VIP/ })).toHaveTextContent('#150')
  })
})
