import { describe, expect, it } from 'vitest'
import type { LiveModel } from '../liveModel'
import { addVip, contestOf, load, modelOf, type Json } from './liveModelTestKit'

describe('standings', () => {
  function standingsOf(snapshot: unknown) {
    const standings = modelOf(snapshot).standings
    if (standings.availability !== 'available') throw new Error('Expected standings to be available')
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

    expect(modelOf(snapshot).standings).toEqual({ availability: 'unavailable' })
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
    if (leaders.availability !== 'available') throw new Error('Expected ownership leaders to be available')
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

    expect(modelOf(snapshot).ownershipLeaders).toEqual({ availability: 'unavailable' })
  })
})

describe('swing players', () => {
  it('lists swing players from the canonical fixture', () => {
    const threat = modelOf(load()).threat
    if (threat.availability !== 'available') throw new Error('Expected threat to be available')

    expect(threat.data.swingPlayers).toHaveLength(10)
    expect(threat.data.swingPlayers[0]).toEqual({
      key: 'cfb:ousmane-kromah:fsu:5900:rb',
      name: 'Ousmane Kromah',
      playerKey: 'cfb:ousmane-kromah:fsu:5900:rb',
      ownershipRemainingPct: 79.11,
      vipCount: 0,
    })
  })

  it('is unavailable for the missing-metrics fixture', () => {
    expect(modelOf(load(), 'mlb').threat).toEqual({ availability: 'unavailable' })
  })

  it('is empty, not unavailable, when the threat metrics list no swing players', () => {
    const snapshot = load()
    contestOf(snapshot).metrics.threat.top_swing_players = []

    expect(modelOf(snapshot).threat).toEqual({ availability: 'available', data: { swingPlayers: [] } })
  })
})

describe('field ownership remaining', () => {
  it("reads the field's average ownership remaining from the ownership leaders total, with no scope", () => {
    const field = modelOf(load()).fieldOwnershipRemaining
    expect(field?.pct).toBeCloseTo(146.4668, 4)
    expect(field?.scope).toBeNull()
  })

  it('prefers the threat field remaining figure over the leaders total, with its scope', () => {
    const snapshot = load()
    contestOf(snapshot).metrics.threat.field_remaining_pct = 150.5
    contestOf(snapshot).metrics.threat.field_remaining_scope = 'contest_field'

    expect(modelOf(snapshot).fieldOwnershipRemaining).toEqual({ pct: 150.5, scope: 'contest_field' })
  })

  it('is null when the feed gives neither', () => {
    const snapshot = load()
    delete contestOf(snapshot, 'mlb').ownership_watchlist

    expect(modelOf(snapshot, 'mlb').fieldOwnershipRemaining).toBeNull()
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

    expect(
      modelOf(snapshot)
        .pool.map((player) => player.name)
        .sort(),
    ).toEqual(['Ownership Signal', 'Points Signal', 'Value Signal'])
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
    expect(icons).toEqual({
      'Hot Guy': 'fire',
      'Cold Guy': 'ice',
      'Plain Guy': null,
      'Null Guy': null,
      'Odd Guy': null,
    })
  })

  it('has no icons for the canonical fixture, which carries none', () => {
    expect(modelOf(load()).pool.every((player) => player.valueIcon === null)).toBe(true)
  })

  it('passes the icon through to VIP lineup players from the matching pool player', () => {
    const snapshot = snapshotWith([{ name: 'Hot Guy', value_icon: 'fire' }, { name: 'Plain Guy' }])
    addVip(snapshot, 'cfb', {
      players_live: [
        { slot: 'QB', player_name: 'Hot Guy' },
        { slot: 'RB', player_name: 'Plain Guy' },
      ],
    })

    expect(modelOf(snapshot).vips[0].players.map((player) => player.valueIcon)).toEqual(['fire', null])
  })

  it('takes a train lineup player icon from the pool', () => {
    const snapshot = snapshotWith([{ name: 'Hot Guy', value_icon: 'fire' }, { name: 'Plain Guy' }])
    contestOf(snapshot).train_clusters = [
      { cluster_id: 't1', user_count: 3, rank: 1, lineup_signature: 'Hot Guy|Plain Guy|LOCKED 🔒' },
    ]
    const trains = modelOf(snapshot).trains
    if (trains.availability !== 'available') throw new Error('Expected trains')

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
        players_live: [
          { slot: 'QB', player_name: 'Ashton Daniels' },
          { slot: 'RB', player_name: 'Ousmane Kromah' },
        ],
      },
      {
        entry_key: 'vip-b',
        display_name: 'Second VIP',
        players_live: [{ slot: 'QB', player_name: 'Ashton Daniels' }],
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
