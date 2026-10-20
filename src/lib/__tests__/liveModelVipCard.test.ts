import { describe, expect, it } from 'vitest'
// NFL mid-slate: six VIPs ranked below the 500-row standings cut (string rank/pmr, `pts`).
import nflSnapshot from '../../../public/mock/snapshots/live-2026-10-04T18-41-34Z.json'
import { formatSigned } from '../format'
import { VIP_KEY, VIP_NAME, addVip, contestOf, load, modelOf, type Json } from './liveModelTestKit'

describe('VIP card from a minimal producer lineup', () => {
  // The producer's lineup row: string rank/pmr, `pts`, no `live` block, no `slots`, minimal players_live rows.
  const MINIMAL_LINEUP = {
    rank: '74',
    pts: 433,
    pmr: '82',
    players_live: [
      {
        slot: 'QB',
        player_key: 'cfb:ashton-daniels:fsu:6500:qb',
        player_name: 'Ashton Daniels',
        salary: 6500,
        is_live: true,
      },
    ],
  }
  const STANDINGS_ROW = {
    entry_key: VIP_KEY,
    username: VIP_NAME,
    rank: 77,
    points: 424.5,
    pmr: 82,
    ownership_remaining_total_pct: 143.5,
    is_cashing: true,
    payout_cents: null,
  }

  function setStandings(snapshot: Json, rows: Json[]) {
    contestOf(snapshot).standings = rows
  }

  function vipOf(snapshot: unknown) {
    const [vip] = modelOf(snapshot).vips
    if (!vip) throw new Error('Expected a VIP')
    return vip
  }

  it('reads rank and PMR from the lineup strings and points from pts, ahead of the standings row', () => {
    const snapshot = load()
    addVip(snapshot, 'cfb', MINIMAL_LINEUP)
    setStandings(snapshot, [{ ...STANDINGS_ROW, pmr: 90 }])

    expect(vipOf(snapshot)).toMatchObject({ rank: 74, points: 433, pmr: 82, ownershipRemainingPct: 143.5 })
  })

  it('ignores lineup strings that are not numbers and falls back to the standings row', () => {
    const snapshot = load()
    addVip(snapshot, 'cfb', { ...MINIMAL_LINEUP, rank: 'n/a', pmr: '', pts: '12 pts' })
    setStandings(snapshot, [STANDINGS_ROW])

    expect(vipOf(snapshot)).toMatchObject({ rank: 77, points: 424.5, pmr: 82 })
  })

  it('lets numeric lineup rank and points win over the standings row', () => {
    const snapshot = load()
    addVip(snapshot, 'cfb', { rank: 12, pmr: 88.5, points: 91.25 })
    setStandings(snapshot, [STANDINGS_ROW])

    expect(vipOf(snapshot)).toMatchObject({ rank: 12, points: 91.25, pmr: 88.5, ownershipRemainingPct: 143.5 })
  })

  it('matches the standings row on vip_entry_key before entry_key', () => {
    const snapshot = load()
    addVip(snapshot, 'cfb', { ...MINIMAL_LINEUP, entry_key: 'someone-else', vip_entry_key: VIP_KEY })
    setStandings(snapshot, [
      { ...STANDINGS_ROW, entry_key: 'someone-else', ownership_remaining_total_pct: 1 },
      STANDINGS_ROW,
    ])

    expect(vipOf(snapshot).ownershipRemainingPct).toBe(143.5)
  })

  it('keeps the lineup figures when the VIP has no standings row or the contest has no standings', () => {
    const snapshot = load()
    addVip(snapshot, 'cfb', MINIMAL_LINEUP)
    setStandings(snapshot, [{ ...STANDINGS_ROW, entry_key: 'someone-else' }])
    expect(vipOf(snapshot)).toMatchObject({ rank: 74, points: 433, pmr: 82, ownershipRemainingPct: null })

    delete contestOf(snapshot).standings
    expect(vipOf(snapshot)).toMatchObject({ rank: 74, points: 433, pmr: 82, ownershipRemainingPct: null })
  })

  it("prefers the standings row's ownership remaining over the leverage row, which matches on entry key only", () => {
    const snapshot = load()
    addVip(snapshot, 'cfb', MINIMAL_LINEUP)
    setStandings(snapshot, [STANDINGS_ROW])
    contestOf(snapshot).metrics.threat.vip_vs_field_leverage = [{ entry_key: VIP_KEY, vip_remaining_pct: 300.5 }]
    expect(vipOf(snapshot).ownershipRemainingPct).toBe(143.5)

    setStandings(snapshot, [])
    expect(vipOf(snapshot).ownershipRemainingPct).toBe(300.5)

    contestOf(snapshot).metrics.threat.vip_vs_field_leverage = [{ display_name: VIP_NAME, vip_remaining_pct: 300.5 }]
    expect(vipOf(snapshot).ownershipRemainingPct).toBeNull()
  })

  it('leaves ownership remaining empty when the standings row omits it, as golf does', () => {
    const snapshot = load()
    addVip(snapshot, 'cfb', MINIMAL_LINEUP)
    setStandings(snapshot, [{ ...STANDINGS_ROW, ownership_remaining_total_pct: undefined }])

    expect(vipOf(snapshot).ownershipRemainingPct).toBeNull()
  })

  describe('player rows', () => {
    // Pool entry in the fixture: ownership 24.02, 18.16 points, In-Progress, value 2.793846153846154.
    const KEYED_ROW = MINIMAL_LINEUP.players_live[0]

    function playersOf(snapshot: unknown) {
      return vipOf(snapshot).players
    }

    it('fills ownership, points, game status and value from the pool player with the same player_key', () => {
      const snapshot = load()
      addVip(snapshot, 'cfb', MINIMAL_LINEUP)

      expect(playersOf(snapshot)).toEqual([
        expect.objectContaining({
          name: 'Ashton Daniels',
          ownershipPct: 24.02,
          points: 18.16,
          gameStatus: 'in-progress',
          value: 2.793846153846154,
        }),
      ])
    })

    it('takes nothing from a same-name pool player when the row has a player_key the pool lacks', () => {
      const snapshot = load()
      addVip(snapshot, 'cfb', { players_live: [{ ...KEYED_ROW, player_key: 'cfb:ashton-daniels:other:1:qb' }] })

      expect(playersOf(snapshot)).toEqual([
        expect.objectContaining({
          name: 'Ashton Daniels',
          ownershipPct: null,
          points: null,
          gameStatus: null,
          value: null,
        }),
      ])
    })

    it('matches a row with no player_key by name', () => {
      const snapshot = load()
      addVip(snapshot, 'cfb', { players_live: [{ player_name: 'Ashton Daniels', salary: 6500 }] })

      expect(playersOf(snapshot)).toEqual([expect.objectContaining({ ownershipPct: 24.02, points: 18.16 })])
    })

    it('does not match a locked row against the pool', () => {
      const snapshot = load()
      addVip(snapshot, 'cfb', { players_live: [{ player_name: 'Ashton Daniels', is_locked: true }] })

      expect(playersOf(snapshot)).toEqual([
        expect.objectContaining({ ownershipPct: null, points: null, gameStatus: null, value: null, matchup: null }),
      ])
    })

    it('does not match a locked row against the pool even when it carries a player_key', () => {
      const snapshot = load()
      addVip(snapshot, 'cfb', { players_live: [{ ...KEYED_ROW, is_locked: true }] })

      expect(playersOf(snapshot)).toEqual([
        expect.objectContaining({ ownershipPct: null, points: null, gameStatus: null, value: null }),
      ])
    })

    it('treats an empty player_key as no key and matches the row by name', () => {
      const snapshot = load()
      addVip(snapshot, 'cfb', { players_live: [{ ...KEYED_ROW, player_key: '' }] })

      expect(playersOf(snapshot)).toEqual([expect.objectContaining({ ownershipPct: 24.02, points: 18.16 })])
    })

    it('keeps separate rows for players with the same roster slot', () => {
      const snapshot = load()
      addVip(snapshot, 'cfb', {
        players_live: [
          KEYED_ROW,
          { ...KEYED_ROW, player_key: 'cfb:austin-simmons:mizz:6700:qb', player_name: 'Austin Simmons' },
        ],
      })

      expect(playersOf(snapshot).map((player) => [player.key, player.slot])).toEqual([
        ['QB-0', 'QB'],
        ['QB-1', 'QB'],
      ])
    })
  })

  it('has no projection when no player row carries a real-time projection, rather than summing to zero', () => {
    const snapshot = load()
    addVip(snapshot, 'cfb', MINIMAL_LINEUP)

    expect(vipOf(snapshot).projectedPoints).toBeNull()
  })

  it('projects from the pool-enriched points when some rows carry a real-time projection', () => {
    const snapshot = load()
    snapshot.sports.cfb.players.find((row: Json) => row.name === 'Austin Simmons').rt_projection = 20
    Object.assign(
      snapshot.sports.cfb.players.find((row: Json) => row.name === 'Ashton Daniels'),
      { fantasy_points: 3, game_status: 'Final' },
    )
    const [keyed] = MINIMAL_LINEUP.players_live
    addVip(snapshot, 'cfb', {
      players_live: [
        // Final, so its points count: 3 on the row, not the pool's 18.16.
        { ...keyed },
        // In progress with a projection; the points so far are pool-only.
        { ...keyed, player_key: 'cfb:austin-simmons:mizz:6700:qb', player_name: 'Austin Simmons' },
        // In progress with no projection: the pool's 4.5 points so far count.
        { ...keyed, player_key: 'cfb:beau-pribula:uva:7600:qb', player_name: 'Beau Pribula' },
      ],
    })

    expect(vipOf(snapshot).projectedPoints).toBe(27.5)
  })

  it('takes cashing from the standings row only when distance to cash and payout say nothing', () => {
    const snapshot = load()
    addVip(snapshot, 'cfb', MINIMAL_LINEUP)
    setStandings(snapshot, [{ ...STANDINGS_ROW, is_cashing: true }])
    expect(vipOf(snapshot).cashing).toBe(true)

    // A matched distance-to-cash row still decides first.
    contestOf(snapshot).metrics.distance_to_cash = {
      cutoff_points: 500,
      per_vip: [{ entry_key: VIP_KEY, points_delta: -75.5 }],
    }
    expect(vipOf(snapshot).cashing).toBe(false)
  })

  it('uses a matched standings payout when its cashing flag is absent', () => {
    const snapshot = load()
    addVip(snapshot, 'cfb', MINIMAL_LINEUP)
    setStandings(snapshot, [{ ...STANDINGS_ROW, is_cashing: undefined, payout_cents: 1000 }])
    expect(vipOf(snapshot).cashing).toBe(true)

    setStandings(snapshot, [{ ...STANDINGS_ROW, is_cashing: false }])
    expect(vipOf(snapshot).cashing).toBe(false)
  })

  it('takes only the missing header figures from the standings row when the lineup has some', () => {
    const snapshot = load()
    addVip(snapshot, 'cfb', { ...MINIMAL_LINEUP, rank: undefined, pmr: undefined, points: 91.25 })
    setStandings(snapshot, [STANDINGS_ROW])

    expect(vipOf(snapshot)).toMatchObject({ rank: 77, points: 91.25, pmr: 82 })
  })
})

describe('VIP card below the standings cut (prod NFL fixture)', () => {
  it("shows each VIP's rank, points and PMR from its lineup row and ownership remaining from its leverage row", () => {
    const vips = modelOf(structuredClone(nflSnapshot), 'nfl').vips.map(
      ({ name, rank, points, pmr, ownershipRemainingPct }) => ({
        name,
        rank,
        points,
        pmr,
        ownershipRemainingPct,
      }),
    )

    expect(vips).toEqual([
      { name: 'cglenn91', rank: 879, points: 28.64, pmr: 390, ownershipRemainingPct: 262.59 },
      { name: 'Cubbiesftw23', rank: 1014, points: 21.339998, pmr: 390, ownershipRemainingPct: 318.41 },
      { name: 'tuck8989', rank: 847, points: 29.64, pmr: 390, ownershipRemainingPct: 202.82 },
      { name: 'EmpireMaker2', rank: 511, points: 30.939999, pmr: 360, ownershipRemainingPct: 373.51 },
      { name: 'Aj_cray', rank: 879, points: 28.64, pmr: 390, ownershipRemainingPct: 207.49 },
      { name: 'Mcoleman1902', rank: 883, points: 28.539999, pmr: 360, ownershipRemainingPct: 314.17 },
    ])
  })
})

describe('field size', () => {
  it('uses the producer max_entries field', () => {
    const snapshot = load()
    expect(modelOf(snapshot).fieldSize).toBe(229)

    contestOf(snapshot).max_entries = 211
    expect(modelOf(snapshot).fieldSize).toBe(211)
  })

  it('is null when the producer emits null', () => {
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
