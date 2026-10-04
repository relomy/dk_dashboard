/* eslint-disable react-refresh/only-export-components -- a test helper, never hot-reloaded */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { useState, type ReactNode } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, vi } from 'vitest'
// Captured from prod; provenance in public/mock/PRODUCER_FIXTURE.md. NFL mid-slate: six VIPs ranked
// 511-1014 below a 500-row standings cut (field of 1,136), locked slots, padded DST names and full
// `metrics` including `threat`. Golf: two VIPs with standings rows, `metrics` without `threat`, no
// ownership watchlist.
import producerSnapshot from '../../public/mock/snapshots/live-2026-10-04T18-41-34Z.json'
import { TopBarSlotContext } from '../context/TopBarSlotContext'
import Live from '../routes/Live'

// The shared harness for the Live route tests: the captured prod fixture (the default input), helpers
// that inject hand-built players and VIPs for edge cases the fixture lacks, and a render of the route
// behind a stubbed API.

const SNAPSHOT_PATH = 'snapshots/live-2026-10-04T18-41-34Z.json'
export const SPORT = 'nfl'

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Json = any

export function load(): Json {
  return structuredClone(producerSnapshot)
}

export function contestOf(snapshot: Json, sport = SPORT): Json {
  return snapshot.sports[sport].contests[0]
}

/** Replaces the sport's player pool; each row gets plain defaults unless it overrides them. */
export function setPlayers(snapshot: Json, players: Json[], sport = SPORT) {
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

/**
 * A hand-built VIP, for edge cases the captured fixture lacks (a cashing VIP, a VIP without a figure,
 * a lineup of known players). Each use says why in its own test; whatever the fixture already shows,
 * a test asserts against the real VIPs instead.
 */
export interface VipSpec {
  key: string
  name: string
  /** Lineup player names; each row takes the pool player's `player_key` when the pool has the name, as the producer's rows do. */
  players?: string[]
  /** `players_live` rows to use instead of the ones built from `players`; null sends name-only `slots`, the legacy shape. */
  liveRows?: Json[] | null
  /** Sent as the producer sends them: rank and PMR as strings, points as `pts`. */
  rank?: number
  points?: number
  pmr?: number
  /** Points distance to cash (the per-VIP metric). */
  delta?: number
  /** Lineup ownership, under either field name. */
  lineupOwn?: number
  lineupOwnField?: 'lineup_ownership_pct' | 'total_ownership_pct'
}

/** Replaces the sport's VIP lineups (and their per-VIP metrics) with hand-built ones shaped as the producer sends them. */
export function setVips(snapshot: Json, vips: VipSpec[], sport = SPORT) {
  const contest = contestOf(snapshot, sport)
  const pool: Json[] = snapshot.sports[sport].players
  const keyOf = (name: string): string | undefined => pool.find((row) => String(row.name).trim() === name.trim())?.player_key
  contest.vip_lineups = vips.map((vip) => {
    const names = vip.players ?? []
    const liveRows =
      vip.liveRows === undefined
        ? names.map((player_name) => {
            const player_key = keyOf(player_name)
            return { is_live: true, ...(player_key ? { player_key } : {}), player_name, slot: 'FLEX' }
          })
        : vip.liveRows
    return {
      entry_key: vip.key,
      vip_entry_key: vip.key,
      display_name: vip.name,
      ...(liveRows === null
        ? { slots: names.map((player_name) => ({ slot: 'FLEX', player_name })) }
        : { players_live: liveRows }),
      ...(vip.rank === undefined ? {} : { rank: String(vip.rank) }),
      ...(vip.points === undefined ? {} : { pts: vip.points }),
      ...(vip.pmr === undefined ? {} : { pmr: String(vip.pmr) }),
    }
  })
  contest.metrics ??= {}
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

/** The captured VIP's feed lineup, by display name. */
export function vipOf(snapshot: Json, displayName: string, sport = SPORT): Json {
  const vip = contestOf(snapshot, sport).vip_lineups.find((row: Json) => row.display_name === displayName)
  if (!vip) throw new Error(`No VIP ${displayName} in the ${sport} fixture`)
  return vip
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
export async function renderLive(snapshot: unknown, path = `/live/${SPORT}`) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/latest') || url.includes('/mock/latest.json')) {
        return new Response(
          JSON.stringify({
            latest_snapshot_path: SNAPSHOT_PATH,
            snapshot_at: '2026-10-04T18:41:34Z',
            generated_at: '2026-10-04T18:41:34Z',
            available_sports: ['golf', 'nfl'],
            manifest_today_path: 'manifest/2026-10-04.json',
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
