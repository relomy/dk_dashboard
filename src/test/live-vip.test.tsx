import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { contestOf, load, location, rail, renderLive, setVips, stubPhone, vipOf, type Json, type VipSpec } from './liveHarness'
import mlbGolden from '../../contract/goldens/mlb.json'

// The Live VIP view: rail rows, the focused VIP's stats, cash-line meter and grouped lineup.
// Driven by the captured NFL slate (field of 1,136, cash line at rank 500): six VIPs ranked 511-1014, all
// below the line and below the standings cut, with locked slots. Hand-built VIPs (`setVips`) appear only
// where the fixture lacks the case; each says why.

// The feed's VIP order. EmpireMaker2 (#511, 0.3 points off the cash line) is the one most tests focus.
const FEED_ORDER = ['cglenn91', 'Cubbiesftw23', 'tuck8989', 'EmpireMaker2', 'Aj_cray', 'Mcoleman1902']
const EMPIRE = 'EmpireMaker2'

const VIPS = '/live/nfl?view=vips'

/** The path of the VIPs view focused on a captured VIP. */
function vipView(snapshot: Json, displayName: string) {
  return `${VIPS}&vip=${String(vipOf(snapshot, displayName).entry_key)}`
}

function chips() {
  return screen.getByRole('navigation', { name: /^vips$/i })
}

/** One of the focused VIP's stats, a labelled group. */
function stat(label: string) {
  return within(screen.getByRole('group', { name: label }))
}

/** A player in the sport's pool, to change what the feed says about them. */
function poolPlayer(snapshot: Json, name: string, sport = 'nfl'): Json {
  const player = snapshot.sports[sport].players.find((row: Json) => row.name === name)
  if (!player) throw new Error(`No ${name} in the ${sport} pool`)
  return player
}

/** The captured VIP's lineup-ownership row in the ownership summary. */
function ownershipRow(snapshot: Json, displayName: string): Json {
  return contestOf(snapshot).metrics.ownership_summary.per_vip.find((row: Json) => row.display_name === displayName)
}

describe('rail', () => {
  it('lists each VIP with rank, PMR and signed distance to cash', async () => {
    await renderLive(load(), '/live/nfl')

    const empire = within(rail()).getByRole('link', { name: /EmpireMaker2/ })
    expect(empire).toHaveTextContent('#511')
    expect(empire).toHaveTextContent('360.0 PMR')
    expect(empire).toHaveTextContent('−0.3')

    const cubbies = within(rail()).getByRole('link', { name: /Cubbiesftw23/ })
    expect(cubbies).toHaveTextContent('#1014')
    expect(cubbies).toHaveTextContent('390.0 PMR')
    expect(cubbies).toHaveTextContent('−9.9')
  })

  it('lists every VIP in the feed, including the ones below the standings cut', async () => {
    await renderLive(load(), '/live/nfl')

    const names = within(rail())
      .getAllByRole('link')
      .map((link) => link.textContent ?? '')
      .filter((text) => FEED_ORDER.some((name) => text.includes(name)))
    expect(names).toHaveLength(FEED_ORDER.length)
    for (const name of FEED_ORDER) expect(within(rail()).getByRole('link', { name: new RegExp(name) })).toHaveTextContent(/#\d+/)
  })

  it('opens a VIP from its rail row and keeps them in the URL', async () => {
    const snapshot = load()
    await renderLive(snapshot, '/live/nfl')

    fireEvent.click(within(rail()).getByRole('link', { name: /Cubbiesftw23/ }))

    expect(location()).toBe(`${VIPS}&vip=${String(vipOf(snapshot, 'Cubbiesftw23').entry_key)}`)
    expect(screen.getByRole('heading', { name: 'Cubbiesftw23' })).toBeInTheDocument()
    expect(within(rail()).getByRole('link', { name: /Cubbiesftw23/ })).toHaveAttribute('aria-current', 'page')
    expect(within(rail()).getByRole('link', { name: /EmpireMaker2/ })).not.toHaveAttribute('aria-current')
  })

  it('still offers the VIPs view when the contest has no VIPs', async () => {
    // Every captured contest tracks VIPs, so this empties one.
    const snapshot = load()
    contestOf(snapshot).vip_lineups = []
    await renderLive(snapshot, '/live/nfl')

    fireEvent.click(within(rail()).getByRole('link', { name: /^vips/i }))

    expect(location()).toBe(VIPS)
    expect(screen.getByText(/no vips are tracked in this contest/i)).toBeInTheDocument()
  })
})

describe('VIP view focus', () => {
  it('focuses the first VIP when the URL names none', async () => {
    await renderLive(load(), VIPS)

    expect(screen.getByRole('heading', { name: FEED_ORDER[0] })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: EMPIRE })).not.toBeInTheDocument()
  })

  it('focuses the VIP named in the URL, as for a shared link or a reload', async () => {
    const snapshot = load()
    await renderLive(snapshot, vipView(snapshot, EMPIRE))

    expect(screen.getByRole('heading', { name: EMPIRE })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: FEED_ORDER[0] })).not.toBeInTheDocument()
  })

  it('falls back to the first VIP for an unknown key', async () => {
    await renderLive(load(), `${VIPS}&vip=nobody`)

    expect(screen.getByRole('heading', { name: FEED_ORDER[0] })).toBeInTheDocument()
  })

  it('says so when the contest has no VIPs', async () => {
    const snapshot = load()
    contestOf(snapshot).vip_lineups = []
    await renderLive(snapshot, VIPS)

    expect(screen.getByText(/no vips are tracked in this contest/i)).toBeInTheDocument()
  })
})

describe('VIP stats', () => {
  it('shows rank out of the field size, for a VIP below the standings cut', async () => {
    const snapshot = load()
    await renderLive(snapshot, vipView(snapshot, EMPIRE))

    expect(stat('Rank').getByText('#511')).toBeInTheDocument()
    expect(stat('Rank').getByText('of 1136')).toBeInTheDocument()
  })

  it('shows points, with no projection when the feed has none', async () => {
    const snapshot = load()
    await renderLive(snapshot, vipView(snapshot, EMPIRE))

    expect(stat('Points').getByText('30.94')).toBeInTheDocument()
    expect(stat('Points').queryByText(/^proj/)).not.toBeInTheDocument()
  })

  it('shows a VIP below the line as a signed distance labelled "not cashing"', async () => {
    const snapshot = load()
    await renderLive(snapshot, vipView(snapshot, EMPIRE))

    expect(stat('vs cash').getByText('−0.3')).toBeInTheDocument()
    expect(stat('vs cash').getByText('not cashing')).toBeInTheDocument()
  })

  it('shows a cashing VIP as a green signed distance labelled "cashing"', async () => {
    // No captured VIP is cashing, so one is given a distance above the line.
    const snapshot = load()
    setVips(snapshot, [{ key: 'vip-a', name: 'First VIP', rank: 12, points: 140.5, pmr: 88.5, delta: 50.25 }])
    await renderLive(snapshot, VIPS)

    expect(stat('vs cash').getByText('+50.25')).toBeInTheDocument()
    expect(stat('vs cash').getByText('cashing')).toBeInTheDocument()
  })

  it('shows a dash for distance when the feed has none, and still says whether they are cashing', async () => {
    const snapshot = load()
    delete contestOf(snapshot).metrics.distance_to_cash
    await renderLive(snapshot, vipView(snapshot, EMPIRE))

    expect(stat('vs cash').getByText('—')).toBeInTheDocument()
    expect(stat('vs cash').getByText('not cashing')).toBeInTheDocument()
  })

  it('uses the matched standings cashing flag when the feed has no distance to cash', async () => {
    const snapshot = load()
    delete contestOf(snapshot).metrics.distance_to_cash
    contestOf(snapshot).standings.push({ entry_key: vipOf(snapshot, EMPIRE).entry_key, is_cashing: true })
    await renderLive(snapshot, vipView(snapshot, EMPIRE))

    expect(stat('vs cash').getByText('cashing')).toBeInTheDocument()
  })

  it('never says "in the money" or "pts in/out"', async () => {
    await renderLive(load(), VIPS)

    expect(screen.queryByText(/in the money/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/pts? in\b|pts? out\b/i)).not.toBeInTheDocument()
  })

  it('shows PMR and ownership remaining', async () => {
    const snapshot = load()
    await renderLive(snapshot, vipView(snapshot, EMPIRE))

    expect(stat('PMR').getByText('360.0')).toBeInTheDocument()
    expect(stat('PMR').getByText('373.51% own remaining')).toBeInTheDocument()
  })

  it('says ownership remaining and PMR are unavailable when the feed omits them', async () => {
    const snapshot = load()
    delete contestOf(snapshot).metrics.threat.vip_vs_field_leverage
    delete vipOf(snapshot, EMPIRE).pmr
    await renderLive(snapshot, vipView(snapshot, EMPIRE))

    expect(stat('PMR').getByText('—')).toBeInTheDocument()
    expect(stat('PMR').getByText(/own remaining unavailable/i)).toBeInTheDocument()
  })

  it('shows lineup ownership with its hint', async () => {
    // 373.51% over nine slots averages 41% a slot.
    const snapshot = load()
    await renderLive(snapshot, vipView(snapshot, EMPIRE))

    expect(stat('Lineup own').getByText('373.51%')).toBeInTheDocument()
    expect(stat('Lineup own').getByText('balanced')).toBeInTheDocument()
  })

  it('hints chalky and contrarian from the average ownership per slot', async () => {
    // The captured lineups all average 29-42% a slot, so two of them are given heavier and lighter ownership.
    const snapshot = load()
    ownershipRow(snapshot, 'cglenn91').total_ownership_pct = 500
    ownershipRow(snapshot, EMPIRE).total_ownership_pct = 100
    await renderLive(snapshot, VIPS)
    expect(stat('Lineup own').getByText('chalky')).toBeInTheDocument()

    cleanup()
    await renderLive(snapshot, vipView(snapshot, EMPIRE))
    expect(stat('Lineup own').getByText('contrarian')).toBeInTheDocument()
  })

  it('reads lineup ownership from the producer summary', async () => {
    const snapshot = load()
    const row = ownershipRow(snapshot, EMPIRE)
    row.total_ownership_pct = 301.5
    await renderLive(snapshot, vipView(snapshot, EMPIRE))

    expect(stat('Lineup own').getByText('301.5%')).toBeInTheDocument()
  })

  it('says lineup ownership is unavailable when the feed omits it', async () => {
    const snapshot = load()
    delete ownershipRow(snapshot, EMPIRE).total_ownership_pct
    await renderLive(snapshot, vipView(snapshot, EMPIRE))

    expect(stat('Lineup own').getByText('—')).toBeInTheDocument()
    expect(stat('Lineup own').getByText('unavailable')).toBeInTheDocument()
  })
})

describe('cash-line meter', () => {
  it('marks the cash line and places every VIP on the field', async () => {
    await renderLive(load(), VIPS)

    const meter = screen.getByRole('img', { name: /cash line/i })
    expect(meter).toHaveAccessibleName(/cash line at rank 500 of 1136/i)
    expect(meter).toHaveAccessibleName(/EmpireMaker2 #511/)
    expect(meter).toHaveAccessibleName(/Cubbiesftw23 #1014/)
    for (const name of FEED_ORDER) expect(meter).toHaveAccessibleName(new RegExp(`${name} #\\d+`))
    expect(screen.getByText('cash 500')).toBeInTheDocument()
  })

  it('says the meter is unavailable when the feed has no cash line rank', async () => {
    const snapshot = load()
    delete contestOf(snapshot).live_metrics.cash_line.rank_cutoff
    await renderLive(snapshot, VIPS)

    expect(screen.queryByRole('img', { name: /cash line/i })).not.toBeInTheDocument()
    expect(screen.getByText(/cash-line meter unavailable/i)).toBeInTheDocument()
  })
})

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
  const HAND_BUILT: VipSpec = { key: 'vip-a', name: 'First VIP', rank: 12, points: 140.5, pmr: 88.5, delta: 50.25, liveRows: LINEUP }

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
      rt_projection: 24.25, time_remaining_minutes: 21.5, stats_text: '2 TD', value_icon: 'fire',
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
      { name: 'Later Guy', rt_projection: 15, game_status: 'FSU@MIZZ 07:30PM ET', fantasy_points: 0, value: 0, ownership_pct: 12 },
      { name: 'Finished Guy', rt_projection: 30, game_status: 'Final', fantasy_points: 30, value: 6.5, ownership_pct: 55 },
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
    Object.assign(poolPlayer(snapshot, 'Trevor Lawrence'), { rt_projection: 0, time_remaining_minutes: 0, value_icon: 'ice' })
    delete vipOf(snapshot, EMPIRE).players_live.find((row: Json) => row.player_name === 'Trevor Lawrence').player_key
    await renderLive(snapshot, vipView(snapshot, EMPIRE))
    expect(card('Trevor Lawrence').getByText('proj 0.00')).toBeInTheDocument()
    expect(card('Trevor Lawrence').getByText('0 min')).toBeInTheDocument()
    expect(card('Trevor Lawrence').getByRole('img', { name: /cold/i })).toBeInTheDocument()
  })

  it.each(['21.5', '2 innings', undefined])('leaves absent or invalid minutes unavailable (%s)', async (minutes) => {
    const snapshot = load()
    Object.assign(poolPlayer(snapshot, 'Trevor Lawrence'), { time_remaining_minutes: minutes, time_remaining_display: '2 innings' })
    await renderLive(snapshot, vipView(snapshot, EMPIRE))
    const player = card('Trevor Lawrence')
    expect(player.queryByText(/min|innings/)).not.toBeInTheDocument()
    expect(player.queryByText(/^proj/)).not.toBeInTheDocument()
    expect(player.queryByRole('img', { name: /hot|cold/i })).not.toBeInTheDocument()
  })

  it('does not reveal pool Scorecard details for unmatched keys or locked slots', async () => {
    const snapshot = load()
    const pooled = poolPlayer(snapshot, 'Trevor Lawrence')
    Object.assign(pooled, { rt_projection: 88, time_remaining_minutes: 7, stats_text: 'Hidden stats', value_icon: 'fire' })
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

describe('on a phone', () => {
  it('replaces the rail with a chip row that switches VIPs', async () => {
    stubPhone()
    const snapshot = load()
    await renderLive(snapshot, VIPS)

    expect(screen.queryByRole('navigation', { name: /live views/i })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: FEED_ORDER[0] })).toBeInTheDocument()
    expect(within(chips()).getByRole('link', { name: new RegExp(FEED_ORDER[0]) })).toHaveAttribute('aria-current', 'page')

    fireEvent.click(within(chips()).getByRole('link', { name: /EmpireMaker2/ }))

    expect(location()).toBe(vipView(snapshot, EMPIRE))
    expect(screen.getByRole('heading', { name: EMPIRE })).toBeInTheDocument()
    expect(within(chips()).getByRole('link', { name: /EmpireMaker2/ })).toHaveAttribute('aria-current', 'page')
  })

  it('shows each chip with the VIP rank', async () => {
    stubPhone()
    await renderLive(load(), VIPS)

    expect(within(chips()).getByRole('link', { name: /EmpireMaker2/ })).toHaveTextContent('#511')
    expect(within(chips()).getByRole('link', { name: /Cubbiesftw23/ })).toHaveTextContent('#1014')
  })
})
