import { describe, expect, it } from 'vitest'
import { VIP_KEY, VIP_NAME, addVip, build, contestOf, load, modelOf, type Json } from './liveModelTestKit'

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

  it('reports a sport with no primary contest configured', () => {
    const snapshot = load()
    delete snapshot.sports.cfb.primary_contest

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
    expect(model.contest).toEqual({
      name: 'CFB Single Entry $25 Double Up',
      state: 'live',
      startTime: '2026-10-03T16:00:00Z',
    })
    expect(model.cashLine).toEqual({ points: 129.04001, rank: 98 })
  })

  it('selects the configured contest from multiple contests', () => {
    const snapshot = load()
    const primary = contestOf(snapshot)
    const decoy = structuredClone(primary)
    decoy.contest_id = '1002'
    decoy.contest_key = 'cfb:1002'
    decoy.name = 'Decoy Contest'
    snapshot.sports.cfb.contests.push(decoy)
    snapshot.sports.cfb.primary_contest.contest_id = '1002'
    snapshot.sports.cfb.primary_contest.contest_key = 'cfb:1002'

    expect(modelOf(snapshot).contest.name).toBe('Decoy Contest')
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
    setDistance(snapshot, [
      { vip_entry_key: null, entry_key: null, display_name: VIP_NAME, points_delta: 99, rank_delta: 99 },
    ])

    const vip = vipOf(snapshot)
    expect(vip.distanceToCash).toEqual({ points: null, rank: null })
    expect(vip.cashing).toBe(false)
  })

  it('falls back to rank delta when the metric has no points delta', () => {
    const snapshot = load()
    addVip(snapshot)
    setDistance(snapshot, [{ entry_key: VIP_KEY, rank_delta: -3 }])

    expect(vipOf(snapshot).cashing).toBe(false)
  })

  it('lets distance to cash override the matched standings cashing flag', () => {
    const snapshot = load()
    addVip(snapshot)
    contestOf(snapshot).standings.push({ entry_key: VIP_KEY, is_cashing: true })
    setDistance(snapshot, [{ entry_key: VIP_KEY, points_delta: -0.25 }])

    expect(vipOf(snapshot).cashing).toBe(false)
  })
})

describe('VIP lineup players', () => {
  const PLAYERS_LIVE_ROW = {
    slot: 'QB',
    player_name: 'Ashton Daniels',
    salary: 3500,
  }

  function playersOf(snapshot: unknown) {
    const [vip] = modelOf(snapshot).vips
    if (!vip) throw new Error('Expected a VIP')
    return vip.players
  }

  it('reads each players_live row into a lineup player with its game status', () => {
    const snapshot = load()
    Object.assign(
      snapshot.sports.cfb.players.find((row: Json) => row.name === 'Ashton Daniels'),
      {
        rt_projection: 21.11,
        time_remaining_minutes: 38.02,
        stats_text: '1 TD',
        fantasy_points: 7.25,
        ownership_pct: 84.67,
        value: 2.07,
      },
    )
    addVip(snapshot, 'cfb', { players_live: [PLAYERS_LIVE_ROW] })

    expect(playersOf(snapshot)).toEqual([
      {
        key: 'QB-0',
        slot: 'QB',
        name: 'Ashton Daniels',
        playerKey: null,
        locked: false,
        gameStatus: 'in-progress',
        points: 7.25,
        projection: 21.11,
        clock: '38.02 min',
        // The fixture's pool repeats the game status as the matchup, which is no matchup at all.
        matchup: null,
        ownershipPct: 84.67,
        value: 2.07,
        valueIcon: null,
        stats: '1 TD',
      },
    ])
  })

  it('keeps a present but empty players_live list as an empty lineup rather than falling back to slots', () => {
    const snapshot = load()
    addVip(snapshot, 'cfb', { players_live: [] })

    expect(playersOf(snapshot)).toEqual([])
  })

  it('carries the contest live update time when present', () => {
    const snapshot = load()
    addVip(snapshot)
    contestOf(snapshot).live_metrics.updated_at = '2026-10-03T20:40:00Z'
    expect(modelOf(snapshot).vips[0]?.updatedAt).toBe('2026-10-03T20:40:00Z')

    delete contestOf(snapshot).live_metrics
    expect(modelOf(snapshot).vips[0]?.updatedAt).toBeNull()
  })

  it('projects final points for finished players and the real-time projection for the rest', () => {
    const snapshot = load()
    snapshot.sports.cfb.players = [
      { name: 'Finished', rt_projection: 25, fantasy_points: 20, game_status: 'Final' },
      { name: 'Playing', rt_projection: 12.5, fantasy_points: 5, game_status: 'In Progress' },
      { name: 'Later' },
    ]
    addVip(snapshot, 'cfb', {
      players_live: [
        { slot: 'QB', player_name: 'Finished' },
        { slot: 'RB', player_name: 'Playing' },
        { slot: 'WR', player_name: 'Later' },
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
  function vipOf(snapshot: unknown, sport = 'cfb') {
    const [vip] = modelOf(snapshot, sport).vips
    if (!vip) throw new Error('Expected a VIP')
    return vip
  }

  function setSummary(snapshot: Json, perVip: Json[]) {
    contestOf(snapshot).metrics.ownership_summary = {
      source: 'vip_lineup_players',
      scope: 'vip_lineup',
      per_vip: perVip,
    }
  }

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

  it('reads lineup ownership from the older total_ownership_pct', () => {
    const snapshot = load()
    addVip(snapshot)
    setSummary(snapshot, [{ entry_key: VIP_KEY, total_ownership_pct: 189.78 }])

    expect(vipOf(snapshot).lineupOwnershipPct).toBe(189.78)
  })

  it('matches the lineup ownership row on vip_entry_key before entry_key, never on display_name', () => {
    const snapshot = load()
    addVip(snapshot, 'cfb', { vip_entry_key: 'vip-key' })
    setSummary(snapshot, [
      { entry_key: VIP_KEY, total_ownership_pct: 1 },
      { display_name: VIP_NAME, total_ownership_pct: 2 },
      { vip_entry_key: 'vip-key', total_ownership_pct: 3 },
    ])
    expect(vipOf(snapshot).lineupOwnershipPct).toBe(3)

    addVip(snapshot)
    setSummary(snapshot, [{ display_name: VIP_NAME, total_ownership_pct: 2 }])
    expect(vipOf(snapshot).lineupOwnershipPct).toBeNull()
  })

  it('has no lineup ownership when the metrics omit the summary', () => {
    const snapshot = load()
    addVip(snapshot, 'mlb')

    expect(vipOf(snapshot, 'mlb').lineupOwnershipPct).toBeNull()
  })
})
