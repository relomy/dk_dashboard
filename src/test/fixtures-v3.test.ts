import { describe, expect, it } from 'vitest'

import latest from '../../public/mock/latest.json'
import manifestToday from '../../public/mock/manifest/2026-10-03.json'
// Exported by the dk_results producer; provenance in public/mock/PRODUCER_FIXTURE.md.
import snapshotV3 from '../../public/mock/snapshots/live-2026-10-03T20-48-31Z.json'
import snapshotNflMidSlate from '../../public/mock/snapshots/live-2026-10-04T18-41-34Z.json'
import snapshotNflShowdown from '../../public/mock/snapshots/live-2026-10-06T04-21-19Z.json'
import { isEnvelopeSnapshot } from '../lib/snapshotContract'
import type { Snapshot } from '../lib/types'

const SNAPSHOT_PATH = 'snapshots/live-2026-10-03T20-48-31Z.json'

const PRODUCER_FIXTURES: Array<[string, unknown]> = [
  ['live-2026-10-03T20-48-31Z', snapshotV3],
  ['live-2026-10-04T18-41-34Z', snapshotNflMidSlate],
  ['live-2026-10-06T04-21-19Z', snapshotNflShowdown],
]

describe('producer v3 fixture bundle', () => {
  it('points latest.json and the manifest at the producer snapshot', () => {
    expect(latest.latest_snapshot_path).toBe(SNAPSHOT_PATH)
    expect(latest.manifest_today_path).toBe('manifest/2026-10-03.json')
    expect(manifestToday.snapshots.map((item) => item.path)).toContain(SNAPSHOT_PATH)
    for (const item of manifestToday.snapshots) {
      expect(item.path.startsWith('snapshots/live-')).toBe(true)
      expect(item.path.endsWith('.json')).toBe(true)
    }
  })
})

describe.each(PRODUCER_FIXTURES)('producer fixture %s', (_name, fixture) => {
  const typedSnapshot = fixture as Snapshot

  it('loads the producer snapshot with schema_version 3 in the envelope shape', () => {
    expect(typedSnapshot.schema_version).toBe(3)
    expect(isEnvelopeSnapshot(fixture)).toBe(true)
  })

  it('matches the emitted v3 shape for key fields', () => {
    const sports = Object.values(typedSnapshot.sports ?? {})
    expect(sports.length).toBeGreaterThan(0)
    for (const sportPayload of sports) {
      expect(typeof sportPayload.primary_contest?.selection_reason).toBe('object')
      expect(Array.isArray(sportPayload.contests?.[0]?.standings)).toBe(true)
    }
  })

  it('emits train_clusters as a bare array of v3 train rows', () => {
    for (const sportPayload of Object.values(typedSnapshot.sports ?? {})) {
      const trains = sportPayload.contests[0]?.train_clusters
      expect(Array.isArray(trains)).toBe(true)
      expect((trains ?? []).length).toBeGreaterThan(0)
      for (const train of trains ?? []) {
        expect(typeof train.cluster_id).toBe('string')
        expect(typeof train.cluster_rule).toBe('string')
        expect(typeof train.user_count).toBe('number')
        expect(typeof train.rank).toBe('number')
        expect(typeof train.points).toBe('number')
        expect(typeof train.pmr).toBe('number')
        expect(typeof train.lineup_signature).toBe('string')
        expect(Array.isArray(train.entry_keys)).toBe(true)
      }
    }
  })
})

// The cases the 2026-10-04 NFL mid-slate capture exists for (relomy/dk_dashboard#37).
describe('prod fixture live-2026-10-04T18-41-34Z', () => {
  interface Row {
    entry_key: string
    is_cashing: boolean
    is_vip: boolean
    points: number
    rank: number
  }
  interface LineupSlot {
    is_locked?: boolean
    player_key?: string
    player_name: string
    slot: string
  }
  interface Lineup {
    entry_key: string
    rank: string
    players_live: LineupSlot[]
  }
  interface Contest {
    standings: Row[]
    vip_lineups: Lineup[]
    ownership_watchlist?: { entries: Array<{ entry_key: string }> }
    train_clusters: Array<{ lineup_signature: string }>
  }
  interface Player {
    name: string
    player_key: string
    game_status?: string
  }
  const sports = (snapshotNflMidSlate as unknown as { sports: Record<string, { contests: Contest[]; players: Player[] }> })
    .sports
  const nfl = sports.nfl.contests[0]
  const golf = sports.golf.contests[0]

  it('has six NFL VIPs ranked 511–1014, all below the 500-row standings cut', () => {
    expect(nfl.vip_lineups.map((lineup) => Number(lineup.rank)).sort((a, b) => a - b)).toEqual([
      511, 847, 879, 879, 883, 1014,
    ])
    expect(Math.max(...nfl.standings.map((row) => row.rank))).toBe(500)
    const standingKeys = new Set(nfl.standings.map((row) => row.entry_key))
    expect(nfl.vip_lineups.filter((lineup) => standingKeys.has(lineup.entry_key))).toEqual([])
  })

  it('has locked slots and padded DST names in the NFL VIP lineups', () => {
    const slots = nfl.vip_lineups.flatMap((lineup) => lineup.players_live)
    expect(slots.some((slot) => slot.is_locked === true && slot.player_key === undefined)).toBe(true)
    const dstNames = slots.filter((slot) => slot.slot === 'DST').map((slot) => slot.player_name)
    expect(dstNames).toContain('Rams ')
    expect(dstNames).toContain('Jets ')
  })

  it('has tied scores inside the NFL cash line', () => {
    const cashingRanks = nfl.standings.filter((row) => row.is_cashing).map((row) => row.rank)
    expect(cashingRanks.length).toBeGreaterThan(new Set(cashingRanks).size)
  })

  it('keeps every watchlist row, every golf VIP row, and every VIP and train player', () => {
    const standingKeys = new Set(nfl.standings.map((row) => row.entry_key))
    for (const entry of nfl.ownership_watchlist?.entries ?? []) {
      expect(standingKeys.has(entry.entry_key)).toBe(true)
    }

    const golfKeys = new Set(golf.standings.map((row) => row.entry_key))
    expect(golf.vip_lineups).toHaveLength(2)
    for (const lineup of golf.vip_lineups) {
      expect(golfKeys.has(lineup.entry_key)).toBe(true)
    }

    for (const [sport, contest] of [
      ['nfl', nfl],
      ['golf', golf],
    ] as const) {
      const playerKeys = new Set(sports[sport].players.map((player) => player.player_key))
      const playerNames = new Set(sports[sport].players.map((player) => player.name.trim()))
      for (const slot of contest.vip_lineups.flatMap((lineup) => lineup.players_live)) {
        if (slot.player_key) expect(playerKeys.has(slot.player_key)).toBe(true)
      }
      for (const train of contest.train_clusters) {
        for (const name of train.lineup_signature.split('|')) {
          if (!name.startsWith('LOCKED')) expect(playerNames.has(name.trim())).toBe(true)
        }
      }
    }
  })
})
