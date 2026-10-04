import { describe, expect, it } from 'vitest'
// Exported by the dk_results producer; provenance in public/mock/PRODUCER_FIXTURE.md.
// cfb carries `metrics.threat`; mlb carries no `metrics` at all (the missing-metrics variant).
import producerSnapshot from '../../../public/mock/snapshots/live-2026-10-03T20-48-31Z.json'
import { formatSigned } from '../format'
import {
  buildLiveModel,
  groupLineup,
  haveOrFade,
  largestTrains,
  lineupOwnershipHint,
  type LiveLineupPlayer,
  type LiveModel,
} from '../liveModel'
import type { Snapshot } from '../types'

const VIP_KEY = '5067365318'
const VIP_NAME = 'cglenn91'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any

function load(): Json {
  return structuredClone(producerSnapshot)
}

function contestOf(snapshot: Json, sport = 'cfb'): Json {
  return snapshot.sports[sport].contests[0]
}

function addVip(snapshot: Json, sport = 'cfb', overrides: Json = {}): Json {
  const vip = {
    entry_key: VIP_KEY,
    display_name: VIP_NAME,
    slots: [{ slot: 'QB', player_name: 'Ashton Daniels' }],
    payout_cents: null,
    ...overrides,
  }
  contestOf(snapshot, sport).vip_lineups = [vip]
  return vip
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function build(snapshot: unknown, sport = 'cfb') {
  return buildLiveModel(snapshot as Snapshot, sport)
}

function modelOf(snapshot: unknown, sport = 'cfb'): LiveModel {
  const result = build(snapshot, sport)
  if (result.kind !== 'ready') throw new Error(`Expected a renderable model, got ${result.reason.kind}`)
  return result.model
}

describe('not renderable results', () => {
  it('reports a snapshot whose schema version is not 3, before reading any sport', () => {
    const snapshot = load()
    snapshot.schema_version = 2
    delete snapshot.sports

    expect(build(snapshot)).toEqual({ kind: 'not-renderable', reason: { kind: 'unsupported-schema', version: 2 } })
  })

  it('reports a snapshot with no schema version as unsupported', () => {
    const snapshot = load()
    delete snapshot.schema_version

    expect(build(snapshot)).toEqual({ kind: 'not-renderable', reason: { kind: 'unsupported-schema', version: null } })
  })

  it('reports a sport that is not in the snapshot', () => {
    expect(build(load(), 'nba')).toEqual({ kind: 'not-renderable', reason: { kind: 'sport-missing' } })
  })

  it('reports a sport with no primary contest configured, even when a contest claims is_primary', () => {
    const snapshot = load()
    delete snapshot.sports.cfb.primary_contest
    contestOf(snapshot).is_primary = true

    expect(build(snapshot)).toEqual({ kind: 'not-renderable', reason: { kind: 'no-primary-contest' } })
  })

  it('reports a configured primary contest that is missing from the snapshot', () => {
    const snapshot = load()
    snapshot.sports.cfb.primary_contest.contest_key = 'cfb:missing'
    snapshot.sports.cfb.primary_contest.contest_id = 'missing'

    expect(build(snapshot)).toEqual({ kind: 'not-renderable', reason: { kind: 'primary-contest-missing' } })
  })
})

describe('primary contest', () => {
  it('describes the configured primary contest from the canonical fixture', () => {
    const model = modelOf(load())

    expect(model.sport).toBe('cfb')
    expect(model.snapshotAt).toBe('2026-10-03T20:48:31Z')
    // Only the name: contest key, id and selection reason are internal and never shown.
    expect(model.contest).toEqual({ name: 'CFB Single Entry $25 Double Up' })
    expect(model.cashLine).toEqual({ points: 129.04001, rank: 98 })
  })

  it('prefers a contest flagged is_primary over the configured key and id', () => {
    const snapshot = load()
    const primary = contestOf(snapshot)
    primary.is_primary = true
    const decoy = structuredClone(primary)
    decoy.is_primary = false
    decoy.contest_id = '1002'
    decoy.contest_key = 'cfb:1002'
    decoy.name = 'Decoy Contest'
    snapshot.sports.cfb.contests.push(decoy)
    snapshot.sports.cfb.primary_contest.contest_id = '1002'
    snapshot.sports.cfb.primary_contest.contest_key = 'cfb:1002'

    expect(modelOf(snapshot).contest.name).toBe('CFB Single Entry $25 Double Up')
  })

  it('falls back to the configured contest id when the key does not match', () => {
    const snapshot = load()
    snapshot.sports.cfb.primary_contest.contest_key = 'cfb:renamed'

    expect(modelOf(snapshot).contest.name).toBe('CFB Single Entry $25 Double Up')
  })

  it('leaves cash line values empty when the feed omits them', () => {
    const snapshot = load()
    delete contestOf(snapshot).live_metrics.cash_line

    expect(modelOf(snapshot).cashLine).toEqual({ points: null, rank: null })
  })
})

describe('VIP cashing and distance to cash', () => {
  function vipOf(snapshot: unknown, sport = 'cfb') {
    const [vip] = modelOf(snapshot, sport).vips
    if (!vip) throw new Error('Expected a VIP')
    return vip
  }

  function setDistance(snapshot: Json, perVip: Json[]) {
    contestOf(snapshot).metrics.distance_to_cash = { per_vip: perVip }
  }

  it('has no VIPs for the producer fixture', () => {
    expect(modelOf(load()).vips).toEqual([])
  })

  it('takes distance to cash from the per-VIP metric matched on entry_key', () => {
    const snapshot = load()
    addVip(snapshot)
    setDistance(snapshot, [{ entry_key: VIP_KEY, points_delta: 11, rank_delta: 44 }])

    const vip = vipOf(snapshot)
    expect(vip.name).toBe(VIP_NAME)
    expect(vip.distanceToCash).toEqual({ points: 11, rank: 44 })
    expect(vip.cashing).toBe(true)
  })

  it('matches per-VIP metrics on vip_entry_key before entry_key', () => {
    const snapshot = load()
    addVip(snapshot, 'cfb', { vip_entry_key: 'vip-key' })
    setDistance(snapshot, [
      { entry_key: VIP_KEY, points_delta: 5 },
      { vip_entry_key: 'vip-key', points_delta: -7.5 },
    ])

    const vip = vipOf(snapshot)
    expect(vip.distanceToCash.points).toBe(-7.5)
    expect(vip.cashing).toBe(false)
  })

  it('does not match per-VIP metrics on display_name', () => {
    const snapshot = load()
    addVip(snapshot)
    setDistance(snapshot, [{ vip_entry_key: null, entry_key: null, display_name: VIP_NAME, points_delta: 99, rank_delta: 99 }])

    const vip = vipOf(snapshot)
    expect(vip.distanceToCash).toEqual({ points: null, rank: null })
    expect(vip.cashing).toBe(false)
  })

  it('falls back to rank delta when the metric has no points delta', () => {
    const snapshot = load()
    addVip(snapshot, 'cfb', { payout_cents: 500 })
    setDistance(snapshot, [{ entry_key: VIP_KEY, rank_delta: -3 }])

    expect(vipOf(snapshot).cashing).toBe(false)
  })

  it('lets distance to cash override payout presence', () => {
    const snapshot = load()
    addVip(snapshot, 'cfb', { payout_cents: 500 })
    setDistance(snapshot, [{ entry_key: VIP_KEY, points_delta: -0.25 }])

    expect(vipOf(snapshot).cashing).toBe(false)
  })

  it('treats payout_cents presence as cashing when distance metrics are missing', () => {
    const snapshot = load()
    addVip(snapshot, 'mlb', { payout_cents: 100, live: { updated_at: '2026-10-03T20:48:31Z', is_cashing: false } })

    const vip = vipOf(snapshot, 'mlb')
    expect(vip.distanceToCash).toEqual({ points: null, rank: null })
    expect(vip.cashing).toBe(true)
  })

  it('treats a live payout as cashing and no payout as not cashing', () => {
    const snapshot = load()
    addVip(snapshot, 'mlb', { live: { updated_at: '2026-10-03T20:48:31Z', payout_cents: 0 } })
    expect(vipOf(snapshot, 'mlb').cashing).toBe(true)

    addVip(snapshot, 'mlb')
    expect(vipOf(snapshot, 'mlb').cashing).toBe(false)
  })
})

describe('VIP lineup players', () => {
  const PLAYERS_LIVE_ROW = {
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

  function playersOf(snapshot: unknown) {
    const [vip] = modelOf(snapshot).vips
    if (!vip) throw new Error('Expected a VIP')
    return vip.players
  }

  it('reads each players_live row into a lineup player with its game status', () => {
    const snapshot = load()
    addVip(snapshot, 'cfb', { players_live: [PLAYERS_LIVE_ROW] })

    expect(playersOf(snapshot)).toEqual([
      {
        key: 'QB-0',
        slot: 'QB',
        name: 'Ashton Daniels',
        gameStatus: 'in-progress',
        points: 7.25,
        projection: 21.11,
        clock: '38.02',
        matchup: 'In-Progress',
        ownershipPct: 84.67,
        value: 2.07,
        valueIcon: null,
        stats: '1 TD',
      },
    ])
  })

  it('classifies each row game status as pre-game, in progress or final', () => {
    const snapshot = load()
    addVip(snapshot, 'cfb', {
      players_live: [
        { ...PLAYERS_LIVE_ROW, slot: 'RB', game_status: 'Final' },
        { ...PLAYERS_LIVE_ROW, slot: 'WR', game_status: 'FSU@MIZZ 07:30PM ET' },
        { ...PLAYERS_LIVE_ROW, slot: 'TE', game_status: undefined },
      ],
    })

    expect(playersOf(snapshot).map((player) => player.gameStatus)).toEqual(['final', 'pre-game', null])
  })

  it('keeps a present but empty players_live list as an empty lineup rather than falling back to slots', () => {
    const snapshot = load()
    addVip(snapshot, 'cfb', { players_live: [] })

    expect(playersOf(snapshot)).toEqual([])
  })

  it('falls back to the name-only slots when players_live is missing', () => {
    const snapshot = load()
    addVip(snapshot, 'cfb', { players_live: null, slots: [{ slot: 'QB', player_name: 'Unknown Slot Name', multiplier: 1.5 }] })

    expect(playersOf(snapshot)).toEqual([
      {
        key: 'QB-0',
        slot: 'QB',
        name: 'Unknown Slot Name',
        gameStatus: null,
        points: null,
        projection: null,
        clock: null,
        matchup: null,
        ownershipPct: null,
        value: null,
        valueIcon: null,
        stats: null,
      },
    ])
  })

  it('carries the VIP live update time when present', () => {
    const snapshot = load()
    addVip(snapshot, 'cfb', { live: { updated_at: '2026-10-03T20:40:00Z' } })
    expect(modelOf(snapshot).vips[0]?.updatedAt).toBe('2026-10-03T20:40:00Z')

    addVip(snapshot)
    expect(modelOf(snapshot).vips[0]?.updatedAt).toBeNull()
  })

  it('projects final points for finished players and the real-time projection for the rest', () => {
    const snapshot = load()
    addVip(snapshot, 'cfb', {
      players_live: [
        { ...PLAYERS_LIVE_ROW, slot: 'QB', points: 20, rt_projection: 25, game_status: 'Final' },
        { ...PLAYERS_LIVE_ROW, slot: 'RB', points: 5, rt_projection: 12.5, game_status: 'In Progress' },
        { ...PLAYERS_LIVE_ROW, slot: 'WR', points: 0, rt_projection: undefined, game_status: 'FSU@MIZZ 07:30PM ET' },
      ],
    })

    expect(modelOf(snapshot).vips[0]?.projectedPoints).toBe(32.5)
  })

  it('has no projection without players_live rows', () => {
    const snapshot = load()
    addVip(snapshot)
    expect(modelOf(snapshot).vips[0]?.projectedPoints).toBeNull()

    addVip(snapshot, 'cfb', { players_live: [] })
    expect(modelOf(snapshot).vips[0]?.projectedPoints).toBeNull()
  })
})

describe('VIP standing and ownership', () => {
  const LIVE = {
    updated_at: '2026-10-03T20:40:00Z',
    current_rank: 12,
    current_points: 140.5,
    pmr: 88.5,
    ownership_remaining_pct: 210.25,
  }

  function vipOf(snapshot: unknown, sport = 'cfb') {
    const [vip] = modelOf(snapshot, sport).vips
    if (!vip) throw new Error('Expected a VIP')
    return vip
  }

  function setSummary(snapshot: Json, perVip: Json[]) {
    contestOf(snapshot).metrics.ownership_summary = { source: 'vip_lineup_players', scope: 'vip_lineup', per_vip: perVip }
  }

  it('reads rank, points, PMR and ownership remaining from the live block', () => {
    const snapshot = load()
    addVip(snapshot, 'cfb', { live: LIVE, rank: 99, points: 1 })

    expect(vipOf(snapshot)).toMatchObject({ rank: 12, points: 140.5, pmr: 88.5, ownershipRemainingPct: 210.25 })
  })

  it('falls back to the lineup rank and points without a live block', () => {
    const snapshot = load()
    addVip(snapshot, 'cfb', { rank: 7, points: 91.25 })

    expect(vipOf(snapshot)).toMatchObject({ rank: 7, points: 91.25, pmr: null, ownershipRemainingPct: null })
  })

  it('leaves standing values empty when the feed omits them', () => {
    const snapshot = load()
    addVip(snapshot)

    expect(vipOf(snapshot)).toMatchObject({ rank: null, points: null, pmr: null, ownershipRemainingPct: null })
  })

  it('reads lineup ownership from the renamed lineup_ownership_pct', () => {
    const snapshot = load()
    addVip(snapshot)
    setSummary(snapshot, [{ entry_key: VIP_KEY, lineup_ownership_pct: 301.5 }])

    expect(vipOf(snapshot).lineupOwnershipPct).toBe(301.5)
  })

  it('reads lineup ownership from the older total_ownership_pct', () => {
    const snapshot = load()
    addVip(snapshot)
    setSummary(snapshot, [{ entry_key: VIP_KEY, total_ownership_pct: 189.78 }])

    expect(vipOf(snapshot).lineupOwnershipPct).toBe(189.78)
  })

  it('prefers lineup_ownership_pct when a row carries both names', () => {
    const snapshot = load()
    addVip(snapshot)
    setSummary(snapshot, [{ entry_key: VIP_KEY, lineup_ownership_pct: 301.5, total_ownership_pct: 189.78 }])

    expect(vipOf(snapshot).lineupOwnershipPct).toBe(301.5)
  })

  it('matches the lineup ownership row on vip_entry_key before entry_key, never on display_name', () => {
    const snapshot = load()
    addVip(snapshot, 'cfb', { vip_entry_key: 'vip-key' })
    setSummary(snapshot, [
      { entry_key: VIP_KEY, lineup_ownership_pct: 1 },
      { display_name: VIP_NAME, lineup_ownership_pct: 2 },
      { vip_entry_key: 'vip-key', lineup_ownership_pct: 3 },
    ])
    expect(vipOf(snapshot).lineupOwnershipPct).toBe(3)

    addVip(snapshot)
    setSummary(snapshot, [{ display_name: VIP_NAME, lineup_ownership_pct: 2 }])
    expect(vipOf(snapshot).lineupOwnershipPct).toBeNull()
  })

  it('has no lineup ownership when the metrics omit the summary', () => {
    const snapshot = load()
    addVip(snapshot, 'mlb')

    expect(vipOf(snapshot, 'mlb').lineupOwnershipPct).toBeNull()
  })

})

describe('field size', () => {
  it('prefers entries_count and falls back to max_entries', () => {
    const snapshot = load()
    expect(modelOf(snapshot).fieldSize).toBe(229)

    contestOf(snapshot).entries_count = 211
    expect(modelOf(snapshot).fieldSize).toBe(211)
  })

  it('is null when the feed gives neither', () => {
    const snapshot = load()
    contestOf(snapshot).max_entries = null
    expect(modelOf(snapshot).fieldSize).toBeNull()
  })
})

describe('signed distance to cash', () => {
  it('writes a plus sign for cashing and a true minus sign for not cashing', () => {
    expect(formatSigned(50.25)).toBe('+50.25')
    expect(formatSigned(-78.5)).toBe('−78.5')
    expect(formatSigned(0)).toBe('+0')
  })

  it('trims to two decimals without trailing zeros and has no negative zero', () => {
    expect(formatSigned(11)).toBe('+11')
    expect(formatSigned(3.14159)).toBe('+3.14')
    expect(formatSigned(-0.001)).toBe('+0')
  })

  it('is a dash when the distance is missing', () => {
    expect(formatSigned(null)).toBe('—')
  })
})

describe('lineup ownership hint', () => {
  it('calls an average of 50% a slot or more chalky, 20% or less contrarian, otherwise balanced', () => {
    expect(lineupOwnershipHint(400, 8)).toBe('chalky')
    expect(lineupOwnershipHint(445.6, 8)).toBe('chalky')
    expect(lineupOwnershipHint(160, 8)).toBe('contrarian')
    expect(lineupOwnershipHint(100, 8)).toBe('contrarian')
    expect(lineupOwnershipHint(240, 8)).toBe('balanced')
  })

  it('has no hint without ownership or slots', () => {
    expect(lineupOwnershipHint(null, 8)).toBeNull()
    expect(lineupOwnershipHint(200, 0)).toBeNull()
  })
})

describe('lineup grouping', () => {
  const player = (name: string, gameStatus: LiveLineupPlayer['gameStatus']): LiveLineupPlayer => ({
    key: name,
    slot: 'FLEX',
    name,
    gameStatus,
    points: null,
    projection: null,
    clock: null,
    matchup: null,
    ownershipPct: null,
    value: null,
    valueIcon: null,
    stats: null,
  })

  it('groups by game status, keeping lineup order, with no game status counting as yet to play', () => {
    const groups = groupLineup([
      player('a', 'final'),
      player('b', 'pre-game'),
      player('c', 'in-progress'),
      player('d', null),
      player('e', 'in-progress'),
    ])

    expect(groups.map((group) => [group.label, group.players.map((p) => p.name)])).toEqual([
      ['Playing now', ['c', 'e']],
      ['Yet to play', ['b', 'd']],
      ['Done', ['a']],
    ])
  })

  it('drops empty groups', () => {
    expect(groupLineup([player('a', 'final')]).map((group) => group.label)).toEqual(['Done'])
    expect(groupLineup([])).toEqual([])
  })
})

describe('trains', () => {
  function trainsOf(snapshot: unknown, sport = 'cfb') {
    const trains = modelOf(snapshot, sport).trains
    if (trains.status !== 'available') throw new Error('Expected trains to be available')
    return trains.data
  }

  it('lists every emitted train, best rank first, from the canonical fixture', () => {
    const trains = trainsOf(load())

    expect(trains.updatedAt).toBe('2026-10-03T20:48:31Z')
    expect(trains.rule).toBe('salary_remaining<=40000_and_same_points_pmr')
    expect(trains.rows).toHaveLength(24)
    expect(trains.rows.slice(0, 3).map((train) => train.rank)).toEqual([2, 8, 18])
    expect(trains.rows[0]).toMatchObject({
      id: '9c5f5c8452ef',
      entries: 2,
      rank: 2,
      points: 190.81998,
      pmr: 125.299995,
      entryKeys: ['5278431522', '5279178148'],
      lineup: [
        'Kamario Taylor',
        'Aiden Flora',
        'Ousmane Kromah',
        'Anthony Evans III',
        'Kenny Darby',
        'Rico Scott',
        'Cayden Lee',
        'Michael Hawkins Jr.',
      ].map((label) => ({ label, locked: false })),
    })
  })

  it('marks locked slots in a train lineup', () => {
    const [best] = trainsOf(load(), 'mlb').rows

    expect(best?.lineup.filter((slot) => slot.locked)).toHaveLength(3)
    expect(best?.lineup[0]).toEqual({ label: 'Locked 🔒', locked: true })
  })

  it('puts unranked trains last', () => {
    const snapshot = load()
    contestOf(snapshot).train_clusters = [
      { cluster_id: 'unranked', user_count: 4 },
      { cluster_id: 'ranked', user_count: 2, rank: 9 },
    ]

    expect(trainsOf(snapshot).rows.map((train) => train.id)).toEqual(['ranked', 'unranked'])
  })

  describe('closeness', () => {
    function oneTrain(snapshot: Json, extra: Json = {}) {
      contestOf(snapshot).train_clusters = [
        { cluster_id: 't1', user_count: 19, rank: 16, lineup_signature: 'A|B|C|D|E|F|G|H', ...extra },
      ]
      const [train] = trainsOf(snapshot).rows
      if (!train) throw new Error('Expected a train')
      return train
    }

    it('reads the optional min_shared_slots against the lineup size', () => {
      const train = oneTrain(load(), { min_shared_slots: 6 })

      expect(train.minSharedSlots).toBe(6)
      expect(train.closeness).toEqual({ minShared: 6, slotCount: 8, identical: false })
    })

    it('is identical when every slot is shared', () => {
      expect(oneTrain(load(), { min_shared_slots: 8 }).closeness).toEqual({ minShared: 8, slotCount: 8, identical: true })
    })

    it('has no closeness when the producer omits min_shared_slots', () => {
      const train = oneTrain(load())

      expect(train.minSharedSlots).toBeNull()
      expect(train.closeness).toBeNull()
    })

    it('ignores a min_shared_slots that is not a whole number, or that has no lineup to compare with', () => {
      expect(oneTrain(load(), { min_shared_slots: 'six' }).closeness).toBeNull()
      expect(oneTrain(load(), { min_shared_slots: 5.5 }).closeness).toBeNull()
      expect(oneTrain(load(), { min_shared_slots: 6, lineup_signature: '' }).closeness).toBeNull()
    })
  })

  describe('lineup players', () => {
    function lineupOf(signature: string, players: Json[]) {
      const snapshot = load()
      snapshot.sports.cfb.players = players
      contestOf(snapshot).train_clusters = [{ cluster_id: 't1', user_count: 3, rank: 1, lineup_signature: signature }]
      const [train] = trainsOf(snapshot).rows
      return train?.players ?? []
    }

    it('takes each player game status, points and ownership from the pool, matched by name', () => {
      const [live, later, done] = lineupOf('Live Guy|Later Guy|Done Guy', [
        { name: 'Live Guy', team: 'FSU', position: 'QB', matchup: 'FSU@MIZZ', salary: 1, game_status: 'In-Progress', fantasy_points: 12.5, ownership_pct: 31.5, value: 4.5 },
        { name: 'Later Guy', team: 'MIZZ', position: 'RB', salary: 1, game_status: 'FSU@MIZZ 07:30PM ET', fantasy_points: 0, ownership_pct: 12 },
        { name: 'Done Guy', team: 'FSU', position: 'WR', salary: 1, game_status: 'Final', fantasy_points: 30, ownership_pct: 55, value: 6.5 },
      ])

      expect(live).toMatchObject({ slot: 'QB', name: 'Live Guy', gameStatus: 'in-progress', points: 12.5, ownershipPct: 31.5, value: 4.5, clock: 'In-Progress', matchup: 'FSU@MIZZ' })
      expect(later).toMatchObject({ slot: 'RB', gameStatus: 'pre-game', points: 0, ownershipPct: 12 })
      expect(done).toMatchObject({ slot: 'WR', gameStatus: 'final', points: 30 })
    })

    it('keeps a player missing from the pool as a name with no live details', () => {
      const [stranger] = lineupOf('Stranger', [])

      expect(stranger).toMatchObject({ name: 'Stranger', slot: '', gameStatus: null, points: null, ownershipPct: null, clock: null, matchup: null })
    })

    it('keeps locked slots in position, with no live details', () => {
      const players = lineupOf('LOCKED 🔒|Live Guy', [{ name: 'Live Guy', team: 'FSU', position: 'QB', salary: 1 }])

      expect(players.map((player) => player.name)).toEqual(['Locked 🔒', 'Live Guy'])
      expect(players[0]).toMatchObject({ gameStatus: null, points: null })
    })

    it('has no players for a train without a lineup', () => {
      expect(lineupOf('', [])).toEqual([])
    })
  })

  describe('riding entries', () => {
    it('joins entry_keys to standings rows for display names, in entry_keys order', () => {
      const snapshot = load()
      contestOf(snapshot).standings = [
        { entry_key: 'k2', username: 'second', rank: 2 },
        { entry_key: 'k1', username: 'first', rank: 1 },
      ]
      contestOf(snapshot).train_clusters = [{ cluster_id: 't1', user_count: 4, rank: 1, entry_keys: ['k1', 'missing', 'k2'] }]

      const [train] = trainsOf(snapshot).rows
      expect(train?.ridingNames).toEqual(['first', 'second'])
    })

    it('has no names when the contest has no standings', () => {
      const snapshot = load()
      delete contestOf(snapshot).standings
      contestOf(snapshot).train_clusters = [{ cluster_id: 't1', user_count: 4, rank: 1, entry_keys: ['k1'] }]

      expect(trainsOf(snapshot).rows[0]?.ridingNames).toEqual([])
    })
  })

  describe('overlap with VIP lineups', () => {
    function overlapSnapshot() {
      const snapshot = load()
      contestOf(snapshot).vip_lineups = [
        { entry_key: 'v1', display_name: 'VIP One', slots: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((player_name) => ({ slot: 'X', player_name })), payout_cents: null },
        { entry_key: 'v2', display_name: 'VIP Two', slots: ['A', 'Z1', 'Z2', 'Z3'].map((player_name) => ({ slot: 'X', player_name })), payout_cents: null },
      ]
      contestOf(snapshot).train_clusters = [
        { cluster_id: 'big', user_count: 14, rank: 36, lineup_signature: 'A|B|C|D|X1|X2|X3|X4' },
        { cluster_id: 'small', user_count: 2, rank: 4, lineup_signature: 'A|B|C|D|E|F|Q1|Q2' },
      ]
      return snapshot
    }

    it('counts the players each VIP shares with the train, by name', () => {
      const trains = trainsOf(overlapSnapshot()).rows
      const big = trains.find((train) => train.id === 'big')
      const small = trains.find((train) => train.id === 'small')

      expect(big?.vipOverlaps).toEqual([
        { key: 'v1', name: 'VIP One', shared: 4 },
        { key: 'v2', name: 'VIP Two', shared: 1 },
      ])
      expect(small?.vipOverlaps.map((overlap) => overlap.shared)).toEqual([6, 1])
    })

    it('never counts a locked slot as shared', () => {
      const snapshot = overlapSnapshot()
      contestOf(snapshot).train_clusters = [{ cluster_id: 'locked', user_count: 3, rank: 1, lineup_signature: 'LOCKED 🔒|LOCKED 🔒|A' }]
      contestOf(snapshot).vip_lineups[0].slots.push({ slot: 'X', player_name: 'Locked 🔒' })

      expect(trainsOf(snapshot).rows[0]?.vipOverlaps.map((overlap) => overlap.shared)).toEqual([1, 1])
    })

    it('points each VIP at the train it shares the most players with, with the VIP lineup size', () => {
      const [one, two] = modelOf(overlapSnapshot()).vips

      expect(one?.trainOverlap).toEqual({ trainId: 'small', entries: 2, rank: 4, shared: 6, slotCount: 8 })
      expect(two?.trainOverlap).toBeNull()
    })

    it('breaks ties by the larger train', () => {
      const snapshot = overlapSnapshot()
      contestOf(snapshot).train_clusters = [
        { cluster_id: 'small', user_count: 2, rank: 4, lineup_signature: 'A|B|C|D|E|F|Q1|Q2' },
        { cluster_id: 'big', user_count: 14, rank: 36, lineup_signature: 'A|B|C|D|E|F|Q3|Q4' },
      ]

      expect(modelOf(snapshot).vips[0]?.trainOverlap?.trainId).toBe('big')
    })

    it('has no overlap when a VIP shares fewer than 4 players with every train', () => {
      const snapshot = overlapSnapshot()
      contestOf(snapshot).train_clusters = [{ cluster_id: 'far', user_count: 9, rank: 1, lineup_signature: 'A|B|C|Y1|Y2|Y3|Y4|Y5' }]

      expect(modelOf(snapshot).vips[0]?.trainOverlap).toBeNull()
    })

    it('has no overlap when trains are unavailable', () => {
      const snapshot = overlapSnapshot()
      delete contestOf(snapshot).train_clusters

      expect(modelOf(snapshot).vips[0]?.trainOverlap).toBeNull()
    })
  })

  describe('largest trains', () => {
    it('orders by entries, then best rank', () => {
      const snapshot = load()
      contestOf(snapshot).train_clusters = [
        { cluster_id: 'a', user_count: 3, rank: 1 },
        { cluster_id: 'b', user_count: 9, rank: 50 },
        { cluster_id: 'c', user_count: 9, rank: 20 },
        { cluster_id: 'd', user_count: 4 },
      ]

      expect(largestTrains(trainsOf(snapshot).rows, 3).map((train) => train.id)).toEqual(['c', 'b', 'd'])
    })
  })

  it('is unavailable when the contest has no train_clusters', () => {
    const snapshot = load()
    delete contestOf(snapshot).train_clusters

    expect(modelOf(snapshot).trains).toEqual({ status: 'unavailable' })
  })

  it('is empty, not unavailable, when train_clusters is an empty list', () => {
    const snapshot = load()
    contestOf(snapshot).train_clusters = []

    expect(trainsOf(snapshot).rows).toEqual([])
  })

  it('is unavailable when every train row is malformed', () => {
    const snapshot = load()
    contestOf(snapshot).train_clusters = [null, 'invalid-row', { cluster_id: 123, user_count: 'x' }, { entry_keys: [42] }]

    expect(modelOf(snapshot).trains).toEqual({ status: 'unavailable' })
  })

  it('does not accept the pre-v3 train_clusters object shape', () => {
    const snapshot = load()
    contestOf(snapshot).train_clusters = {
      updated_at: '2026-10-03T20:48:31Z',
      clusters: [{ cluster_key: 'old', entry_count: 9 }],
    }

    expect(modelOf(snapshot).trains).toEqual({ status: 'unavailable' })
  })
})

describe('standings', () => {
  function standingsOf(snapshot: unknown) {
    const standings = modelOf(snapshot).standings
    if (standings.status !== 'available') throw new Error('Expected standings to be available')
    return standings.data
  }

  it('lists every standings row from the canonical fixture', () => {
    const rows = standingsOf(load())

    expect(rows).toHaveLength(35)
    expect(rows[0]).toEqual({
      key: '5279434606',
      name: 'sbish11',
      rank: 1,
      points: 191.71999,
      pmr: 107.45999,
      ownershipRemainingPct: 215.74,
      payoutCents: null,
      cashing: true,
    })
  })

  it('prefers the emitted is_cashing and falls back to payout_cents presence', () => {
    const snapshot = load()
    contestOf(snapshot).standings = [
      { entry_key: 'emitted-no', username: 'Emitted No', is_cashing: false, payout_cents: 1234 },
      { entry_key: 'paid', username: 'Paid', payout_cents: 1234 },
      { entry_key: 'unpaid', username: 'Unpaid', payout_cents: null },
    ]

    expect(standingsOf(snapshot).map((row) => [row.name, row.cashing, row.payoutCents])).toEqual([
      ['Emitted No', false, 1234],
      ['Paid', true, 1234],
      ['Unpaid', false, null],
    ])
  })

  it('names a row by username, then entry key', () => {
    const snapshot = load()
    contestOf(snapshot).standings = [{ entry_key: 'no-username' }, { rank: 4 }]

    expect(standingsOf(snapshot).map((row) => [row.key, row.name])).toEqual([
      ['no-username', 'no-username'],
      ['standings-4-1', null],
    ])
  })

  it('is unavailable when the contest has no standings', () => {
    const snapshot = load()
    delete contestOf(snapshot).standings

    expect(modelOf(snapshot).standings).toEqual({ status: 'unavailable' })
  })

  it('is empty, not unavailable, when standings is an empty list', () => {
    const snapshot = load()
    contestOf(snapshot).standings = []

    expect(standingsOf(snapshot)).toEqual([])
  })

  it('does not read rows from the pre-v3 standings object shape', () => {
    const snapshot = load()
    contestOf(snapshot).standings = { rows: [{ entry_key: 'old-row', username: 'Old Row' }] }

    expect(standingsOf(snapshot)).toEqual([])
  })
})

describe('ownership leaders', () => {
  function leadersOf(snapshot: unknown) {
    const leaders = modelOf(snapshot).ownershipLeaders
    if (leaders.status !== 'available') throw new Error('Expected ownership leaders to be available')
    return leaders.data
  }

  it('lists the top ten leaders from the canonical fixture', () => {
    const leaders = leadersOf(load())

    expect(leaders.topN).toBe(10)
    expect(leaders.entries).toHaveLength(10)
    expect(leaders.entries[0]).toEqual({
      key: '5275419617',
      name: 'bruc0074',
      ownershipRemainingPct: 272.07,
      pmr: 231.83,
      rank: 142,
      points: 113.18,
    })
  })

  it('respects top_n_default', () => {
    const snapshot = load()
    contestOf(snapshot).ownership_watchlist.top_n_default = 1

    const leaders = leadersOf(snapshot)
    expect(leaders.topN).toBe(1)
    expect(leaders.entries.map((entry) => entry.name)).toEqual(['bruc0074'])
  })

  it('names a leader by entry key when the display name is missing', () => {
    const snapshot = load()
    contestOf(snapshot).ownership_watchlist.entries = [{ entry_key: 'key-only' }]

    expect(leadersOf(snapshot).entries[0]?.name).toBe('key-only')
  })

  it('is empty, not unavailable, when the watchlist has no entries', () => {
    const snapshot = load()
    contestOf(snapshot).ownership_watchlist.entries = []

    expect(leadersOf(snapshot).entries).toEqual([])
  })

  it('is unavailable when the contest has no ownership watchlist', () => {
    const snapshot = load()
    delete contestOf(snapshot).ownership_watchlist

    expect(modelOf(snapshot).ownershipLeaders).toEqual({ status: 'unavailable' })
  })
})

describe('swing players', () => {
  it('lists swing players from the canonical fixture', () => {
    const threat = modelOf(load()).threat
    if (threat.status !== 'available') throw new Error('Expected threat to be available')

    expect(threat.data.swingPlayers).toHaveLength(10)
    expect(threat.data.swingPlayers[0]).toEqual({
      key: 'cfb:ousmane-kromah:fsu:5900:rb',
      name: 'Ousmane Kromah',
      ownershipRemainingPct: 79.11,
      vipCount: 0,
    })
  })

  it('reads the older remaining_ownership_pct name for a swing player', () => {
    const snapshot = load()
    contestOf(snapshot).metrics.threat.top_swing_players = [{ player_name: 'Alt Field', remaining_ownership_pct: 12.5 }]

    const threat = modelOf(snapshot).threat
    expect(threat).toEqual({
      status: 'available',
      data: { swingPlayers: [{ key: 'Alt Field-0', name: 'Alt Field', ownershipRemainingPct: 12.5, vipCount: 0 }] },
    })
  })

  it('is unavailable for the missing-metrics fixture', () => {
    expect(modelOf(load(), 'mlb').threat).toEqual({ status: 'unavailable' })
  })

  it('is empty, not unavailable, when the threat metrics list no swing players', () => {
    const snapshot = load()
    contestOf(snapshot).metrics.threat.top_swing_players = []

    expect(modelOf(snapshot).threat).toEqual({ status: 'available', data: { swingPlayers: [] } })
  })

})

describe('field ownership remaining', () => {
  it("reads the field's average ownership remaining from the ownership leaders total", () => {
    expect(modelOf(load()).fieldOwnershipRemainingPct).toBeCloseTo(146.4668, 4)
  })

  it('falls back to the threat field remaining figure when the leaders carry no total', () => {
    const snapshot = load()
    delete contestOf(snapshot).ownership_watchlist.ownership_remaining_total_pct
    contestOf(snapshot).metrics.threat.field_remaining_pct = 150.5

    expect(modelOf(snapshot).fieldOwnershipRemainingPct).toBe(150.5)
  })

  it('is null when the feed gives neither', () => {
    const snapshot = load()
    delete contestOf(snapshot, 'mlb').ownership_watchlist

    expect(modelOf(snapshot, 'mlb').fieldOwnershipRemainingPct).toBeNull()
  })
})

describe('HAVE or FADE', () => {
  const lineup = (...names: string[]): LiveLineupPlayer[] =>
    names.map((name) => ({
      key: name,
      slot: 'FLEX',
      name,
      gameStatus: null,
      points: null,
      projection: null,
      clock: null,
      matchup: null,
      ownershipPct: null,
      value: null,
      valueIcon: null,
      stats: null,
    }))

  it('is HAVE when the focused lineup rosters the player and FADE when it does not', () => {
    const focused = lineup('Ousmane Kromah', 'Cayden Lee')

    expect(haveOrFade(focused, 'Ousmane Kromah')).toBe('have')
    expect(haveOrFade(focused, 'Duce Robinson')).toBe('fade')
  })

  it('is neither without a focused lineup', () => {
    expect(haveOrFade(null, 'Ousmane Kromah')).toBeNull()
  })
})

describe('player pool', () => {
  function setPlayers(snapshot: Json, players: Json[]) {
    snapshot.sports.cfb.players = players.map((row, index) => ({
      player_key: `test:${index}`,
      team: 'FSU',
      position: 'QB',
      matchup: 'vs. MIZZ',
      salary: 5000,
      ownership_pct: 0,
      fantasy_points: 0,
      value: 0,
      game_status: 'In-Progress',
      ...row,
    }))
  }

  it('orders the pool by ownership, then points', () => {
    const snapshot = load()
    setPlayers(snapshot, [
      { name: 'Low Own', ownership_pct: 10, fantasy_points: 40 },
      { name: 'High Own', ownership_pct: 30, fantasy_points: 20 },
    ])

    expect(modelOf(snapshot).pool.map((player) => player.name)).toEqual(['High Own', 'Low Own'])
  })

  it('drops players with no ownership, points or value', () => {
    const snapshot = load()
    setPlayers(snapshot, [
      { name: 'Hidden Player' },
      { name: 'Points Signal', fantasy_points: 1 },
      { name: 'Ownership Signal', ownership_pct: 2 },
      { name: 'Value Signal', value: 1 },
    ])

    expect(modelOf(snapshot).pool.map((player) => player.name).sort()).toEqual([
      'Ownership Signal',
      'Points Signal',
      'Value Signal',
    ])
  })

  it('maps the canonical fixture players to pool rows', () => {
    const ashton = modelOf(load()).pool.find((player) => player.name === 'Ashton Daniels')

    expect(ashton).toMatchObject({
      key: 'cfb:ashton-daniels:fsu:6500:qb',
      team: 'FSU',
      position: 'QB',
      salary: 6500,
      ownershipPct: 24.02,
      points: 18.16,
      status: 'In-Progress',
    })
  })
})

describe('value icon', () => {
  // DraftKings' hot/cold marker (relomy/dk_results#165) is optional; the model passes it through and never invents one.
  function snapshotWith(players: Json[]): Json {
    const snapshot = load()
    snapshot.sports.cfb.players = players.map((row, index) => ({
      player_key: `test:${index}`,
      team: 'FSU',
      position: 'QB',
      salary: 5000,
      ownership_pct: 10,
      fantasy_points: 10,
      game_status: 'In-Progress',
      ...row,
    }))
    return snapshot
  }

  it('passes fire and ice through to pool players and leaves it empty when absent or unrecognised', () => {
    const snapshot = snapshotWith([
      { name: 'Hot Guy', value_icon: 'fire' },
      { name: 'Cold Guy', value_icon: 'ice' },
      { name: 'Plain Guy' },
      { name: 'Null Guy', value_icon: null },
      { name: 'Odd Guy', value_icon: 'lava' },
    ])

    const icons = Object.fromEntries(modelOf(snapshot).pool.map((player) => [player.name, player.valueIcon]))
    expect(icons).toEqual({ 'Hot Guy': 'fire', 'Cold Guy': 'ice', 'Plain Guy': null, 'Null Guy': null, 'Odd Guy': null })
  })

  it('has no icons for the canonical fixture, which carries none', () => {
    expect(modelOf(load()).pool.every((player) => player.valueIcon === null)).toBe(true)
  })

  it('passes the icon through to VIP lineup players from players_live', () => {
    const snapshot = load()
    addVip(snapshot, 'cfb', {
      players_live: [
        { slot: 'QB', player_name: 'Hot Guy', value_icon: 'fire' },
        { slot: 'RB', player_name: 'Plain Guy' },
      ],
    })

    expect(modelOf(snapshot).vips[0].players.map((player) => player.valueIcon)).toEqual(['fire', null])
  })

  it('has no icon on name-only VIP slots', () => {
    const snapshot = load()
    addVip(snapshot)

    expect(modelOf(snapshot).vips[0].players.map((player) => player.valueIcon)).toEqual([null])
  })

  it('takes a train lineup player icon from the pool', () => {
    const snapshot = snapshotWith([{ name: 'Hot Guy', value_icon: 'fire' }, { name: 'Plain Guy' }])
    contestOf(snapshot).train_clusters = [
      { cluster_id: 't1', user_count: 3, rank: 1, lineup_signature: 'Hot Guy|Plain Guy|LOCKED 🔒' },
    ]
    const trains = modelOf(snapshot).trains
    if (trains.status !== 'available') throw new Error('Expected trains')

    expect(trains.data.rows[0].players.map((player) => player.valueIcon)).toEqual(['fire', null, null])
  })
})

describe('game status', () => {
  function poolWithStatuses(statuses: string[]): Json {
    const snapshot = load()
    snapshot.sports.cfb.players = statuses.map((game_status) => ({
      name: game_status,
      team: 'FSU',
      salary: 5000,
      ownership_pct: 10,
      game_status,
    }))
    return snapshot
  }

  function statusesOf(snapshot: Json): Record<string, unknown> {
    return Object.fromEntries(modelOf(snapshot).pool.map((player) => [player.name, player.gameStatus]))
  }

  it('derives pre-game, in progress and final from the feed game status', () => {
    const snapshot = poolWithStatuses(['Final', 'In-Progress', 'In Progress', 'FSU@MIZZ 07:30PM ET'])

    expect(statusesOf(snapshot)).toEqual({
      Final: 'final',
      'In-Progress': 'in-progress',
      'In Progress': 'in-progress',
      'FSU@MIZZ 07:30PM ET': 'pre-game',
    })
  })

  it('counts a paused game as in progress and a called-off game as final', () => {
    const snapshot = poolWithStatuses(['Delayed', 'Suspended', 'Postponed', 'Cancelled'])

    expect(statusesOf(snapshot)).toEqual({
      Delayed: 'in-progress',
      Suspended: 'in-progress',
      Postponed: 'final',
      Cancelled: 'final',
    })
  })

  it('leaves a player with no game status, or an unrecognised one, without a game status', () => {
    const snapshot = poolWithStatuses(['', 'UNKNOWN'])
    snapshot.sports.cfb.players.push({ name: 'Missing', team: 'FSU', salary: 5000, ownership_pct: 10 })

    expect(statusesOf(snapshot)).toEqual({ '': null, UNKNOWN: null, Missing: null })
  })

  it('has no game status for golf, whose feed carries only the tournament name', () => {
    const golfers = modelOf(load(), 'golf').pool

    expect(golfers.length).toBeGreaterThan(0)
    expect(golfers.every((golfer) => golfer.gameStatus === null)).toBe(true)
  })
})

describe('VIP cross-reference on the player pool', () => {
  function withTwoVips(): Json {
    const snapshot = load()
    contestOf(snapshot).vip_lineups = [
      {
        entry_key: 'vip-a',
        display_name: 'First VIP',
        slots: [
          { slot: 'QB', player_name: 'Ashton Daniels' },
          { slot: 'RB', player_name: 'Ousmane Kromah' },
        ],
      },
      {
        entry_key: 'vip-b',
        display_name: 'Second VIP',
        slots: [{ slot: 'QB', player_name: 'Ashton Daniels' }],
      },
    ]
    return snapshot
  }

  function vipsOn(model: LiveModel, name: string) {
    return model.pool.find((player) => player.name === name)?.vipIndexes
  }

  it('lists, in VIP order, the VIPs whose lineup rosters each player', () => {
    const model = modelOf(withTwoVips())

    expect(vipsOn(model, 'Ashton Daniels')).toEqual([0, 1])
    expect(vipsOn(model, 'Ousmane Kromah')).toEqual([0])
  })

  it('leaves players no VIP rosters with an empty list', () => {
    const model = modelOf(withTwoVips())
    const unrostered = model.pool.filter((player) => !['Ashton Daniels', 'Ousmane Kromah'].includes(player.name))

    expect(unrostered.length).toBeGreaterThan(0)
    expect(unrostered.every((player) => player.vipIndexes.length === 0)).toBe(true)
  })

  it('reads the lineup from players_live when the feed provides it', () => {
    const snapshot = load()
    addVip(snapshot, 'cfb', {
      slots: [],
      players_live: [{ slot: 'RB', player_name: 'Ousmane Kromah' }],
    })

    expect(vipsOn(modelOf(snapshot), 'Ousmane Kromah')).toEqual([0])
  })
})

describe('total ownership', () => {
  it('splits the whole pool ownership into final, in play and pre-game shares of the raw total', () => {
    const snapshot = load()
    snapshot.sports.cfb.players = [
      { name: 'A', team: 'FSU', salary: 5000, ownership_pct: 50, game_status: 'Final' },
      { name: 'B', team: 'FSU', salary: 5000, ownership_pct: 30, game_status: 'Final' },
      { name: 'C', team: 'FSU', salary: 5000, ownership_pct: 60, game_status: 'In-Progress' },
      { name: 'D', team: 'MIZZ', salary: 5000, ownership_pct: 60, game_status: 'FSU@MIZZ 07:30PM ET' },
      { name: 'Unowned', team: 'MIZZ', salary: 5000, ownership_pct: 0, fantasy_points: 0, game_status: 'Final' },
    ]

    expect(modelOf(snapshot).totalOwnership).toEqual({
      total: 200,
      final: 80,
      inPlay: 60,
      preGame: 60,
      finalShare: 40,
      inPlayShare: 30,
      preGameShare: 30,
    })
  })

  it('sums the canonical fixture pool', () => {
    const total = modelOf(load()).totalOwnership

    expect(total.total).toBeCloseTo(724.55, 2)
    expect(total.final).toBeCloseTo(327.99, 2)
    expect(total.inPlay).toBeCloseTo(396.56, 2)
    expect(total.preGame).toBe(0)
  })

  it('counts players without a game status in the total but in no share', () => {
    const total = modelOf(load(), 'golf').totalOwnership

    expect(total.total).toBeGreaterThan(0)
    expect(total).toMatchObject({ final: 0, inPlay: 0, preGame: 0, finalShare: 0, inPlayShare: 0, preGameShare: 0 })
  })

  it('has zero shares when the pool has no ownership', () => {
    const snapshot = load()
    snapshot.sports.cfb.players = []

    expect(modelOf(snapshot).totalOwnership).toEqual({
      total: 0,
      final: 0,
      inPlay: 0,
      preGame: 0,
      finalShare: 0,
      inPlayShare: 0,
      preGameShare: 0,
    })
  })
})
