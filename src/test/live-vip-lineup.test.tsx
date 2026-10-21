import { cleanup, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { load, renderLive, setVips, vipOf, type Json, type VipSpec } from './liveHarness'
import { EMPIRE, VIPS, poolPlayer, vipView } from './liveVipTestKit'
import mlbGolden from '../../contract/goldens/mlb.json'

describe('lineup', () => {
  // Synthetic game-status combinations cover cases absent from the captured mid-slate lineup.
  const ROW = {
    slot: 'QB',
    player_name: 'Ashton Daniels',
    salary: 3500,
  }
  const LINEUP = [
    { ...ROW, slot: 'QB', player_name: 'Live Guy' },
    { ...ROW, slot: 'RB', player_name: 'Later Guy' },
    { ...ROW, slot: 'WR', player_name: 'Finished Guy' },
  ]
  const HAND_BUILT: VipSpec = {
    key: 'vip-a',
    name: 'First VIP',
    rank: 12,
    points: 140.5,
    pmr: 88.5,
    delta: 50.25,
    liveRows: LINEUP,
  }

  function group(name: RegExp) {
    return screen.getByRole('region', { name })
  }

  /** The lineup card of a player, by name (the card's text includes the slot). */
  function card(name: string) {
    const found = screen.getAllByRole('listitem').find((item) => within(item).queryByText(name))
    if (!found) throw new Error(`No lineup card for ${name}`)
    return within(found)
  }

  it('groups the lineup into Playing now, Yet to play and Done', async () => {
    // The captured slate has every player in progress, so one of EmpireMaker2's players is finished and one not started.
    const snapshot = load()
    poolPlayer(snapshot, 'Chase Brown').game_status = 'Final'
    poolPlayer(snapshot, 'Jeremiyah Love').game_status = 'ARI@NYG 07:30PM ET'
    await renderLive(snapshot, vipView(snapshot, EMPIRE))

    expect(within(group(/^playing now/i)).getByText('Trevor Lawrence')).toBeInTheDocument()
    expect(within(group(/^yet to play/i)).getByText('Jeremiyah Love')).toBeInTheDocument()
    expect(within(group(/^done/i)).getByText('Chase Brown')).toBeInTheDocument()
    expect(within(group(/^done/i)).queryByText('Trevor Lawrence')).not.toBeInTheDocument()
  })

  it('counts the in-progress players and the locked slots in their groups', async () => {
    const snapshot = load()
    await renderLive(snapshot, vipView(snapshot, EMPIRE))

    const groupHeadings = screen
      .getAllByRole('region')
      .map((region) => within(region).getByRole('heading').textContent)
      .filter((heading) => /^(playing now|yet to play|done)/i.test(heading ?? ''))
    expect(groupHeadings).toEqual(['Playing now · 6', 'Yet to play · 3'])
  })

  it('shows each player slot, points, ownership, value and game from the player pool', async () => {
    const snapshot = load()
    await renderLive(snapshot, vipView(snapshot, EMPIRE))

    const lawrence = card('Trevor Lawrence')
    expect(lawrence.getByText('QB')).toBeInTheDocument()
    expect(lawrence.getByText('9.44')).toBeInTheDocument()
    expect(lawrence.getByText('70.86% own')).toBeInTheDocument()
    expect(lawrence.getByText('1.6')).toBeInTheDocument()
    expect(lawrence.getByText('at CIN')).toBeInTheDocument()
  })

  it('shows each player projection, game clock and stat line when the feed sends them', async () => {
    const snapshot = load()
    Object.assign(poolPlayer(snapshot, 'Trevor Lawrence'), {
      rt_projection: 24.25,
      time_remaining_minutes: 21.5,
      stats_text: '2 TD',
      value_icon: 'fire',
    })
    await renderLive(snapshot, vipView(snapshot, EMPIRE))

    const live = card('Trevor Lawrence')
    expect(live.getByText('QB')).toBeInTheDocument()
    expect(live.getByText('9.44')).toBeInTheDocument()
    expect(live.getByText('proj 24.25')).toBeInTheDocument()
    expect(live.getByText('21.5 min')).toBeInTheDocument()
    expect(live.getByText('70.86% own')).toBeInTheDocument()
    expect(live.getByText('1.6')).toBeInTheDocument()
    expect(live.getByText('2 TD')).toBeInTheDocument()
    expect(live.getByRole('img', { name: /hot/i })).toBeInTheDocument()
  })

  it("shows each player's matchup from the player pool, and none for golf, where the pool has no matchup", async () => {
    const snapshot = load()
    await renderLive(snapshot, vipView(snapshot, EMPIRE))
    expect(card('Garrett Wilson').getByText('at CHI')).toBeInTheDocument()
    expect(card('Rams').getByText('at PHI')).toBeInTheDocument()

    cleanup()
    const golfVip = vipOf(snapshot, 'cglenn91', 'golf')
    await renderLive(snapshot, `/live/golf?view=vips&vip=${String(golfVip.entry_key)}`)
    expect(within(group(/^playing now|^yet to play|^done/i)).queryByText(/@|vs\./)).not.toBeInTheDocument()
  })

  it('trims ownership to two decimals', async () => {
    // The feed sends the Rams' ownership as 54.400000000000006.
    const snapshot = load()
    await renderLive(snapshot, vipView(snapshot, EMPIRE))

    expect(card('Rams').getByText('54.4% own')).toBeInTheDocument()
  })

  it('hides value for players who have not started and projection for finished ones', async () => {
    const snapshot = load()
    snapshot.sports.nfl.players.push(
      { name: 'Live Guy', game_status: 'In Progress', fantasy_points: 12.5, value: 4.5, ownership_pct: 31.5 },
      {
        name: 'Later Guy',
        rt_projection: 15,
        game_status: 'FSU@MIZZ 07:30PM ET',
        fantasy_points: 0,
        value: 0,
        ownership_pct: 12,
      },
      {
        name: 'Finished Guy',
        rt_projection: 30,
        game_status: 'Final',
        fantasy_points: 30,
        value: 6.5,
        ownership_pct: 55,
      },
    )
    setVips(snapshot, [HAND_BUILT])
    await renderLive(snapshot, VIPS)

    const later = within(within(group(/^yet to play/i)).getByRole('listitem'))
    expect(later.getByText('proj 15.00')).toBeInTheDocument()
    expect(later.getByText('FSU@MIZZ 07:30PM ET')).toBeInTheDocument()
    expect(later.getByText('—')).toBeInTheDocument()

    const done = within(within(group(/^done/i)).getByRole('listitem'))
    expect(done.getByText('30.00')).toBeInTheDocument()
    expect(done.queryByText(/^proj/)).not.toBeInTheDocument()
    expect(done.getByText('6.5')).toBeInTheDocument()
  })

  it('shows the producer golden Scorecard and explicitly supplied zero minutes', async () => {
    await renderLive(mlbGolden, '/live/mlb?view=vips')
    const judge = card('Aaron Judge')
    expect(judge.getByText('proj 31.25')).toBeInTheDocument()
    expect(judge.getByText('0 min')).toBeInTheDocument()
    expect(judge.getByText('1 HR, 2 RBI, 1 R')).toBeInTheDocument()
    expect(judge.getByRole('img', { name: /hot/i })).toBeInTheDocument()
  })

  it('preserves zero projection and cold markers for a keyless matched player', async () => {
    const snapshot = load()
    Object.assign(poolPlayer(snapshot, 'Trevor Lawrence'), {
      rt_projection: 0,
      time_remaining_minutes: 0,
      value_icon: 'ice',
    })
    delete vipOf(snapshot, EMPIRE).players_live.find((row: Json) => row.player_name === 'Trevor Lawrence').player_key
    await renderLive(snapshot, vipView(snapshot, EMPIRE))
    expect(card('Trevor Lawrence').getByText('proj 0.00')).toBeInTheDocument()
    expect(card('Trevor Lawrence').getByText('0 min')).toBeInTheDocument()
    expect(card('Trevor Lawrence').getByRole('img', { name: /cold/i })).toBeInTheDocument()
  })

  it.each(['21.5', '2 innings', undefined])('leaves absent or invalid minutes unavailable (%s)', async (minutes) => {
    const snapshot = load()
    Object.assign(poolPlayer(snapshot, 'Trevor Lawrence'), {
      time_remaining_minutes: minutes,
      time_remaining_display: '2 innings',
    })
    await renderLive(snapshot, vipView(snapshot, EMPIRE))
    const player = card('Trevor Lawrence')
    expect(player.queryByText(/min|innings/)).not.toBeInTheDocument()
    expect(player.queryByText(/^proj/)).not.toBeInTheDocument()
    expect(player.queryByRole('img', { name: /hot|cold/i })).not.toBeInTheDocument()
  })

  it('does not reveal pool Scorecard details for unmatched keys or locked slots', async () => {
    const snapshot = load()
    const pooled = poolPlayer(snapshot, 'Trevor Lawrence')
    Object.assign(pooled, {
      rt_projection: 88,
      time_remaining_minutes: 7,
      stats_text: 'Hidden stats',
      value_icon: 'fire',
    })
    const rows = vipOf(snapshot, EMPIRE).players_live
    rows.find((row: Json) => row.player_name === 'Trevor Lawrence').player_key = 'missing-key'
    const locked = rows.find((row: Json) => row.is_locked)
    Object.assign(locked, { player_key: pooled.player_key, player_name: pooled.name })
    await renderLive(snapshot, vipView(snapshot, EMPIRE))
    expect(card('Trevor Lawrence').queryByText(/^proj/)).not.toBeInTheDocument()
    expect(screen.queryByText('Hidden stats')).not.toBeInTheDocument()
    expect(screen.queryByText('7 min')).not.toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /hot/i })).not.toBeInTheDocument()
    expect(screen.getAllByText('Locked 🔒')).toHaveLength(3)
  })

  it('puts players with no game status in Yet to play', async () => {
    // A player the pool does not carry has no status; the captured lineups only roster pooled players.
    const snapshot = load()
    setVips(snapshot, [{ ...HAND_BUILT, liveRows: [{ ...ROW, player_name: 'Unknown Status' }] }])
    await renderLive(snapshot, VIPS)

    expect(within(group(/^yet to play/i)).getByText('Unknown Status')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /^playing now/i })).not.toBeInTheDocument()
  })

  it('shows an unmatched player as yet to play when the pool has no live details', async () => {
    const snapshot = load()
    setVips(snapshot, [{ key: 'vip-a', name: 'First VIP', players: ['Slot Only Guy'] }])
    await renderLive(snapshot, VIPS)

    expect(within(group(/^yet to play/i)).getByText('Slot Only Guy')).toBeInTheDocument()
  })

  it('shows locked slots as locked cards with only their slot, never the producer marker', async () => {
    // EmpireMaker2 has locked WR, TE and FLEX slots.
    const snapshot = load()
    await renderLive(snapshot, vipView(snapshot, EMPIRE))

    const locked = screen.getAllByRole('listitem').filter((item) => within(item).queryByText('Locked 🔒'))
    expect(locked.map((item) => within(item).getByText(/^(WR|TE|FLEX)$/).textContent)).toEqual(['WR', 'TE', 'FLEX'])
    for (const item of locked) expect(item).not.toHaveTextContent('—')
    expect(screen.queryByText(/LOCKED/)).not.toBeInTheDocument()
  })

  it('shows a padded DST name as the team, with its pool figures', async () => {
    // The feed pads the lineup row ("Rams ") but not the pool ("Rams").
    const snapshot = load()
    await renderLive(snapshot, vipView(snapshot, EMPIRE))

    expect(card('Rams').getByText('DST')).toBeInTheDocument()
    expect(card('Rams').getByText('3.00')).toBeInTheDocument()
  })

  it('says so when the lineup has no players', async () => {
    const snapshot = load()
    setVips(snapshot, [{ ...HAND_BUILT, liveRows: [] }])
    await renderLive(snapshot, VIPS)

    expect(screen.getByText(/no lineup players are available for this vip/i)).toBeInTheDocument()
  })
})
