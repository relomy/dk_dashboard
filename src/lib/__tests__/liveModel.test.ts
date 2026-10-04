import { describe, expect, it } from 'vitest'
// Exported by the dk_results producer; provenance in public/mock/PRODUCER_FIXTURE.md.
// cfb carries `metrics.threat`; mlb carries no `metrics` at all (the missing-metrics variant).
import producerSnapshot from '../../../public/mock/snapshots/live-2026-10-03T20-48-31Z.json'
import { buildLiveModel, type LiveModel } from '../liveModel'
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

    expect(build(snapshot)).toEqual({
      kind: 'not-renderable',
      reason: { kind: 'primary-contest-missing', contestKey: 'cfb:missing', contestId: 'missing' },
    })
  })
})

describe('primary contest', () => {
  it('describes the configured primary contest from the canonical fixture', () => {
    const model = modelOf(load())

    expect(model.sport).toBe('cfb')
    expect(model.snapshotAt).toBe('2026-10-03T20:48:31Z')
    expect(model.contest).toEqual({
      name: 'CFB Single Entry $25 Double Up',
      contestKey: 'cfb:196178015',
      contestId: '196178015',
      selectionReason: 'explicit_id',
    })
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
    snapshot.sports.cfb.contests.push(decoy)
    snapshot.sports.cfb.primary_contest.contest_id = '1002'
    snapshot.sports.cfb.primary_contest.contest_key = 'cfb:1002'

    expect(modelOf(snapshot).contest.contestId).toBe('196178015')
  })

  it('falls back to the configured contest id when the key does not match', () => {
    const snapshot = load()
    snapshot.sports.cfb.primary_contest.contest_key = 'cfb:renamed'

    expect(modelOf(snapshot).contest.contestKey).toBe('cfb:196178015')
  })

  it('accepts a plain-string selection reason and omits a blank one', () => {
    const snapshot = load()
    snapshot.sports.cfb.primary_contest.selection_reason = 'manual pick'
    expect(modelOf(snapshot).contest.selectionReason).toBe('manual pick')

    snapshot.sports.cfb.primary_contest.selection_reason = { mode: '  ' }
    expect(modelOf(snapshot).contest.selectionReason).toBeNull()
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

describe('VIP lineup details', () => {
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

  function lineupOf(snapshot: unknown) {
    const [vip] = modelOf(snapshot).vips
    if (!vip) throw new Error('Expected a VIP')
    return vip.lineup
  }

  it('uses players_live rows when the feed provides them', () => {
    const snapshot = load()
    addVip(snapshot, 'cfb', { players_live: [PLAYERS_LIVE_ROW] })

    expect(lineupOf(snapshot)).toEqual({ kind: 'players-live', players: [PLAYERS_LIVE_ROW] })
  })

  it('keeps a present but empty players_live list as empty rather than falling back to slots', () => {
    const snapshot = load()
    addVip(snapshot, 'cfb', { players_live: [] })

    expect(lineupOf(snapshot)).toEqual({ kind: 'players-live', players: [] })
  })

  it('falls back to the name-only slots when players_live is missing', () => {
    const snapshot = load()
    addVip(snapshot, 'cfb', { players_live: null, slots: [{ slot: 'QB', player_name: 'Unknown Slot Name', multiplier: 1.5 }] })

    expect(lineupOf(snapshot)).toEqual({
      kind: 'slots',
      slots: [{ slot: 'QB', player_name: 'Unknown Slot Name', multiplier: 1.5 }],
    })
  })

  it('carries the VIP live update time when present', () => {
    const snapshot = load()
    addVip(snapshot, 'cfb', { live: { updated_at: '2026-10-03T20:40:00Z' } })
    expect(modelOf(snapshot).vips[0]?.updatedAt).toBe('2026-10-03T20:40:00Z')

    addVip(snapshot)
    expect(modelOf(snapshot).vips[0]?.updatedAt).toBeNull()
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
    expect(trains.rows[0]).toEqual({
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

  it('lists the top ten leaders and the remaining total from the canonical fixture', () => {
    const leaders = leadersOf(load())

    expect(leaders.totalPct).toBeCloseTo(146.4668, 4)
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

describe('VIP ownership summary', () => {
  function setSummary(snapshot: Json, perVip: Json[]) {
    contestOf(snapshot).metrics.ownership_summary = { source: 'vip_lineup_players', scope: 'vip_lineup', per_vip: perVip }
  }

  it('is unavailable when the metrics omit it', () => {
    const snapshot = load()
    addVip(snapshot, 'mlb')

    expect(modelOf(snapshot, 'mlb').ownershipSummary).toEqual({ status: 'unavailable' })
  })

  it('joins summary rows to VIP lineups on the per-VIP key, never display_name', () => {
    const snapshot = load()
    addVip(snapshot)
    setSummary(snapshot, [
      { entry_key: VIP_KEY, total_ownership_pct: 189.78, ownership_in_play_pct: 116.06, is_partial: false },
      { display_name: VIP_NAME, total_ownership_pct: 999.99, ownership_in_play_pct: 999.99, is_partial: true },
    ])

    expect(modelOf(snapshot).ownershipSummary).toEqual({
      status: 'available',
      data: [{ key: VIP_KEY, name: VIP_NAME, totalOwnershipPct: 189.78, ownershipInPlayPct: 116.06, partial: false }],
    })
  })

  it('is empty when no summary row matches a VIP', () => {
    const snapshot = load()
    addVip(snapshot)
    setSummary(snapshot, [{ entry_key: 'non-matching-entry-key', total_ownership_pct: 10.5 }])

    expect(modelOf(snapshot).ownershipSummary).toEqual({ status: 'available', data: [] })
  })
})

describe('threat and leverage', () => {
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

  it('is unavailable for the missing-metrics fixture, leverage included', () => {
    const model = modelOf(load(), 'mlb')

    expect(model.threat).toEqual({ status: 'unavailable' })
    expect(model.leverage).toEqual({ status: 'unavailable' })
  })

  it('treats leverage as unavailable when the threat metrics omit it', () => {
    expect(modelOf(load()).leverage).toEqual({ status: 'unavailable' })
  })

  it('lists VIP vs field leverage rows with the field remaining line', () => {
    const snapshot = load()
    const threat = contestOf(snapshot).metrics.threat
    threat.field_remaining_pct = 4.56
    threat.field_remaining_scope = 'contest_field'
    threat.field_remaining_is_partial = true
    threat.vip_vs_field_leverage = [
      { vip_entry_key: 'vip-1', display_name: 'Leverage VIP', vip_remaining_pct: 11.11, field_remaining_pct: 4.56, uniqueness_delta_pct: 6.55 },
    ]

    expect(modelOf(snapshot).leverage).toEqual({
      status: 'available',
      data: {
        fieldRemaining: { pct: 4.56, contestField: true, partial: true },
        rows: [
          { key: 'vip-1', name: 'Leverage VIP', vipRemainingPct: 11.11, fieldRemainingPct: 4.56, uniquenessDeltaPct: 6.55 },
        ],
      },
    })
  })

  it('omits the field remaining line when the feed lacks the field total', () => {
    const snapshot = load()
    contestOf(snapshot).metrics.threat.vip_vs_field_leverage = []

    expect(modelOf(snapshot).leverage).toEqual({ status: 'available', data: { fieldRemaining: null, rows: [] } })
  })
})

describe('non-cashing', () => {
  it('reads entries not cashing, average PMR and top remaining players', () => {
    const snapshot = load()
    contestOf(snapshot).metrics.non_cashing = {
      users_not_cashing: 109,
      avg_pmr_remaining: 342.83,
      top_remaining_players: [{ player_name: 'Jalen Johnson', ownership_remaining_pct: 92.66 }],
    }

    expect(modelOf(snapshot).nonCashing).toEqual({
      status: 'available',
      data: {
        entriesNotCashing: 109,
        avgPmrRemaining: 342.83,
        topRemainingPlayers: { status: 'available', data: [{ name: 'Jalen Johnson', ownershipRemainingPct: 92.66 }] },
      },
    })
  })

  it('tells an empty top remaining list apart from a missing one', () => {
    const snapshot = load()
    const contest = contestOf(snapshot)
    contest.metrics.non_cashing = { users_not_cashing: 0, avg_pmr_remaining: 0, top_remaining_players: [] }
    const empty = modelOf(snapshot).nonCashing
    expect(empty.status === 'available' && empty.data.topRemainingPlayers).toEqual({ status: 'available', data: [] })

    contest.metrics.non_cashing = { users_not_cashing: 7, avg_pmr_remaining: 123.45 }
    const missing = modelOf(snapshot).nonCashing
    expect(missing.status === 'available' && missing.data.topRemainingPlayers).toEqual({ status: 'unavailable' })
  })

  it('is unavailable when the metrics omit it', () => {
    expect(modelOf(load()).nonCashing).toEqual({ status: 'unavailable' })
    expect(modelOf(load(), 'mlb').nonCashing).toEqual({ status: 'unavailable' })
  })

  it('reads average salary per player remaining from live metrics', () => {
    const snapshot = load()
    expect(modelOf(snapshot).avgSalaryPerPlayerRemaining).toEqual({ status: 'unavailable' })

    contestOf(snapshot).live_metrics.avg_salary_per_player_remaining = 6158
    expect(modelOf(snapshot).avgSalaryPerPlayerRemaining).toEqual({ status: 'available', data: 6158 })
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
