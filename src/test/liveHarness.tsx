/* eslint-disable react-refresh/only-export-components -- a test helper, never hot-reloaded */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { useState, type ReactNode } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, vi } from 'vitest'
// Exported by the dk_results producer; provenance in public/mock/PRODUCER_FIXTURE.md.
// cfb carries `metrics.threat` (field of 229, cash line at rank 98); mlb carries no `metrics` at all.
// The fixture has no VIP lineups, so tests that need them inject minimal ones with `setVips`.
import producerSnapshot from '../../public/mock/snapshots/live-2026-10-03T20-48-31Z.json'
import { TopBarSlotContext } from '../context/TopBarSlotContext'
import Live from '../routes/Live'

// The shared harness for the Live route tests: the producer fixture, helpers that inject
// players, VIPs and trains into it, and a render of the route behind a stubbed API.

const SNAPSHOT_PATH = 'snapshots/live-2026-10-03T20-48-31Z.json'

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Json = any

export function load(): Json {
  return structuredClone(producerSnapshot)
}

export function contestOf(snapshot: Json, sport = 'cfb'): Json {
  return snapshot.sports[sport].contests[0]
}

/** Replaces the sport's player pool; each row gets plain defaults unless it overrides them. */
export function setPlayers(snapshot: Json, players: Json[], sport = 'cfb') {
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

export interface VipSpec {
  key: string
  name: string
  /** Lineup player names: the name-only slots, and in-progress `players_live` rows unless `liveRows` is given. */
  players?: string[]
  /** `players_live` rows as the feed sends them; null leaves `players_live` out. */
  liveRows?: Json[] | null
  rank?: number
  points?: number
  pmr?: number
  ownLeft?: number
  /** Points distance to cash (the per-VIP metric). */
  delta?: number
  /** Lineup ownership, under either field name. */
  lineupOwn?: number
  lineupOwnField?: 'lineup_ownership_pct' | 'total_ownership_pct'
}

export function setVips(snapshot: Json, vips: VipSpec[], sport = 'cfb') {
  const contest = contestOf(snapshot, sport)
  contest.vip_lineups = vips.map((vip) => {
    const names = vip.players ?? []
    const liveRows =
      vip.liveRows === undefined
        ? names.map((player_name) => ({ slot: 'FLEX', player_name, game_status: 'In-Progress' }))
        : vip.liveRows
    return {
      entry_key: vip.key,
      display_name: vip.name,
      slots: names.map((player_name) => ({ slot: 'FLEX', player_name })),
      ...(liveRows === null ? {} : { players_live: liveRows }),
      payout_cents: null,
      live: {
        updated_at: '2026-10-03T20:48:00Z',
        current_rank: vip.rank,
        current_points: vip.points,
        pmr: vip.pmr,
        ownership_remaining_pct: vip.ownLeft,
      },
    }
  })
  const withDelta = vips.filter((vip) => vip.delta !== undefined)
  if (withDelta.length > 0) {
    contest.metrics.distance_to_cash = {
      per_vip: withDelta.map((vip) => ({ entry_key: vip.key, points_delta: vip.delta })),
    }
  }
  const withLineupOwn = vips.filter((vip) => vip.lineupOwn !== undefined)
  if (withLineupOwn.length > 0) {
    contest.metrics.ownership_summary = {
      source: 'vip_lineup_players',
      scope: 'vip_lineup',
      per_vip: withLineupOwn.map((vip) => ({
        entry_key: vip.key,
        [vip.lineupOwnField ?? 'lineup_ownership_pct']: vip.lineupOwn,
      })),
    }
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Makes `useIsPhone` report a phone-width screen. */
export function stubPhone() {
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

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  cleanup()
})

/** The app shell's top bar slot, so the route's top-bar readout renders into a banner. */
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

/** Renders the Live route at `path` over `snapshot` and waits for its heading. */
export async function renderLive(snapshot: unknown, path = '/live/cfb') {
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

/** The path and search the app is at now. */
export function location() {
  return screen.getByTestId('location').textContent
}

/** The tablet and desktop rail. */
export function rail() {
  return screen.getByRole('navigation', { name: /live views/i })
}
