import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  contestOf,
  load,
  playerRow,
  playersTable,
  renderLive,
  setPlayers,
  setVips,
  stubPhone,
  vipOf,
  type Json,
} from './liveHarness'

// The Live route as a whole: states where there is nothing to render, the plain-language rules,
// and edge cases of the producer fixture (no primary contest, missing sections, empty standings).
// Driven by the captured NFL slate: six VIPs below the standings cut, `metrics.threat`, an ownership
// watchlist and trains. Golf carries `metrics` without `threat` and has no watchlist. Where the fixture
// lacks a case, the test changes a clone of it or injects a hand-built piece, and says why.

// The feed's VIP order; the first is the focus when the URL names none.
const FIRST_VIP = 'cglenn91'

function setTrains(snapshot: Json, trains: Array<{ id: string; size: number; players: string[] }>) {
  contestOf(snapshot).train_clusters = trains.map((train, index) => ({
    cluster_id: train.id,
    user_count: train.size,
    rank: index + 1,
    points: 100,
    pmr: 50,
    lineup_signature: train.players.join('|'),
    entry_keys: [],
  }))
}

/** No developer notes, issue links or internal identifiers anywhere on the page. */
function expectNoDeveloperDetails() {
  const text = document.body.textContent ?? ''
  expect(text).not.toMatch(/dk_results|#156|feed does not provide/i)
  expect(text).not.toMatch(/contest key|contest id|selection reason|explicit_id|configured (key|id)/i)
  expect(text).not.toMatch(/\/sport\//)
  expect(text).not.toMatch(/196169749|196164820/)
  for (const link of screen.queryAllByRole('link')) {
    expect(link).not.toHaveAttribute('href', expect.stringContaining('github.com'))
  }
}

describe('nothing to render', () => {
  it('says the snapshot format is unsupported for a schema version other than 3', async () => {
    const snapshot = load()
    snapshot.schema_version = 2

    await renderLive(snapshot)

    expect(screen.getByText(/this snapshot uses an unsupported format \(version 2\)/i)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expectNoDeveloperDetails()
  })

  it('says the sport is not in the snapshot', async () => {
    await renderLive(load(), '/live/nba')

    expect(screen.getByText(/this snapshot has no NBA data/i)).toBeInTheDocument()
    expectNoDeveloperDetails()
  })

  it('says why the view is empty when the sport has no primary contest, and links to all contests', async () => {
    const snapshot = load()
    delete snapshot.sports.nfl.primary_contest

    await renderLive(snapshot)

    expect(screen.getByText(/no primary contest is set for NFL/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /all NFL contests/i })).toHaveAttribute('href', '/sport/nfl')
    expectNoDeveloperDetails()
  })

  it('says the primary contest is missing from the snapshot without naming its key or id', async () => {
    const snapshot = load()
    snapshot.sports.nfl.primary_contest.contest_key = 'nfl:777'
    snapshot.sports.nfl.primary_contest.contest_id = '777'

    await renderLive(snapshot)

    expect(screen.getByText(/the primary contest for NFL is not in this snapshot/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /all NFL contests/i })).toHaveAttribute('href', '/sport/nfl')
    expect(document.body).not.toHaveTextContent('777')
    expectNoDeveloperDetails()
  })
})

describe('hot and cold markers', () => {
  /** A lineup player card: the list item naming the player. */
  function lineupCard(name: string) {
    const card = screen.getAllByRole('listitem').find((item) => within(item).queryByText(name))
    if (!card) throw new Error(`No lineup card for ${name}`)
    return within(card)
  }

  // The captured feed sends no `value_icon` anywhere, so the icon tests hand-build a pool, a VIP and a train.
  function iconSnapshot(): Json {
    const snapshot = load()
    setPlayers(snapshot, [
      { name: 'Hot Guy', value_icon: 'fire' },
      { name: 'Cold Guy', value_icon: 'ice' },
      { name: 'Plain Guy' },
    ])
    setVips(snapshot, [
      {
        key: 'vip-a',
        name: 'First VIP',
        liveRows: [
          { slot: 'QB', player_name: 'Hot Guy', game_status: 'In-Progress', value_icon: 'fire' },
          { slot: 'RB', player_name: 'Cold Guy', game_status: 'In-Progress', value_icon: 'ice' },
          { slot: 'WR', player_name: 'Plain Guy', game_status: 'In-Progress' },
        ],
      },
    ])
    setTrains(snapshot, [{ id: 'train-1', size: 9, players: ['Hot Guy', 'Cold Guy', 'Plain Guy'] }])
    return snapshot
  }

  it('marks players in the Players table with the DraftKings icon the feed provides', async () => {
    await renderLive(iconSnapshot())

    expect(within(playerRow('Hot Guy')).getByRole('img', { name: /hot/i })).toHaveTextContent('🔥')
    expect(within(playerRow('Cold Guy')).getByRole('img', { name: /cold/i })).toHaveTextContent('❄️')
    expect(within(playerRow('Plain Guy')).queryByRole('img')).not.toBeInTheDocument()
  })

  it('marks VIP lineup players with the icon the feed provides', async () => {
    await renderLive(iconSnapshot(), '/live/nfl?view=vips')

    expect(lineupCard('Hot Guy').getByRole('img', { name: /hot/i })).toHaveTextContent('🔥')
    expect(lineupCard('Cold Guy').getByRole('img', { name: /cold/i })).toHaveTextContent('❄️')
    expect(lineupCard('Plain Guy').queryByRole('img')).not.toBeInTheDocument()
  })

  it('marks Train lineup players with the icon from the player pool', async () => {
    await renderLive(iconSnapshot(), '/live/nfl?view=trains')

    expect(lineupCard('Hot Guy').getByRole('img', { name: /hot/i })).toHaveTextContent('🔥')
    expect(lineupCard('Cold Guy').getByRole('img', { name: /cold/i })).toHaveTextContent('❄️')
    expect(lineupCard('Plain Guy').queryByRole('img')).not.toBeInTheDocument()
  })

  it('shows no markers anywhere when the feed provides no value icon', async () => {
    const snapshot = load()

    for (const path of ['/live/nfl', '/live/nfl?view=vips', '/live/nfl?view=trains']) {
      await renderLive(snapshot, path)
      expect(document.body.textContent).not.toMatch(/🔥|❄️/)
      expect(screen.queryByRole('img', { name: /hot|cold/i })).not.toBeInTheDocument()
      cleanup()
    }
  })
})

describe('Leverage panel', () => {
  function section(name: string) {
    return within(screen.getByRole('region', { name }))
  }

  /** "Unfinished, most owned — vs <focused lineup>" */
  function swingSubtitle() {
    return section('Swing players').getByText(/unfinished, most owned/i)
  }

  function swingRow(name: string) {
    const row = section('Swing players')
      .getAllByRole('listitem')
      .find((item) => within(item).queryByText(name))
    if (!row) throw new Error(`No swing row for ${name}`)
    return row
  }

  /** The VIPs view focused on a captured VIP. */
  function vipView(snapshot: Json, displayName: string) {
    return `/live/nfl?view=vips&vip=${String(vipOf(snapshot, displayName).entry_key)}`
  }

  // NFL swing players, most owned first: Parker Washington, Trevor Lawrence, Jeremiyah Love, Garrett Wilson,
  // Rams, Chase Brown, Dontayvion Wicks, Ja'Marr Chase, Cardinals, Josh Allen.
  // cglenn91 (the first VIP) rosters Lawrence, Brown, Wilson, Wicks and the Rams; Cubbiesftw23 rosters
  // Lawrence, Love, Wilson, Washington and the Rams.

  describe('placement', () => {
    it('sits beside the main area on tablet and desktop, with its three sections', async () => {
      await renderLive(load())

      const aside = within(screen.getByRole('complementary', { name: /leverage/i }))
      for (const name of ['Swing players', 'Leverage vs field', 'Ownership leaders']) {
        expect(aside.getByRole('heading', { name })).toBeInTheDocument()
      }
      expect(screen.getByRole('table', { name: /players/i })).toBeInTheDocument()
    })

    it('fills the main area once, when a link opens the Leverage view on a wide screen', async () => {
      await renderLive(load(), '/live/nfl?view=leverage')

      expect(screen.getAllByRole('heading', { name: 'Swing players' })).toHaveLength(1)
      expect(screen.queryByRole('table', { name: /players/i })).not.toBeInTheDocument()
    })

    it('is its own tab on phones and stays off the other tabs', async () => {
      stubPhone()
      await renderLive(load())

      expect(screen.queryByRole('heading', { name: 'Swing players' })).not.toBeInTheDocument()
      fireEvent.click(within(screen.getByRole('navigation', { name: /live tabs/i })).getByRole('link', { name: 'Leverage' }))

      expect(screen.getByRole('heading', { name: 'Swing players' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Leverage vs field' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Ownership leaders' })).toBeInTheDocument()
      expect(screen.queryByRole('table', { name: /players/i })).not.toBeInTheDocument()
    })
  })

  describe('swing players', () => {
    it('lists the most-owned unfinished players with their ownership remaining', async () => {
      await renderLive(load())

      const names = section('Swing players')
        .getAllByRole('listitem')
        .map((row) => row.textContent)
      expect(names[0]).toMatch(/Parker Washington.*84\.34%/)
      expect(names[1]).toMatch(/Trevor Lawrence.*79\.13%/)
      expect(names).toHaveLength(10)
    })

    it('marks each HAVE or FADE against the first VIP by default', async () => {
      await renderLive(load())

      expect(swingSubtitle()).toHaveTextContent(`vs ${FIRST_VIP}`)
      for (const name of ['Trevor Lawrence', 'Garrett Wilson', 'Rams', 'Chase Brown', 'Dontayvion Wicks']) {
        expect(swingRow(name)).toHaveTextContent('HAVE')
      }
      for (const name of ['Parker Washington', 'Jeremiyah Love', "Ja'Marr Chase", 'Cardinals', 'Josh Allen']) {
        expect(swingRow(name)).toHaveTextContent('FADE')
      }
    })

    it('follows the VIP in focus on the VIPs view', async () => {
      const snapshot = load()
      await renderLive(snapshot, vipView(snapshot, 'Cubbiesftw23'))

      expect(swingSubtitle()).toHaveTextContent('vs Cubbiesftw23')
      expect(swingRow('Parker Washington')).toHaveTextContent('HAVE')
      expect(swingRow('Jeremiyah Love')).toHaveTextContent('HAVE')
      expect(swingRow('Chase Brown')).toHaveTextContent('FADE')
    })

    it('keeps following the VIP named in the link on the Players view', async () => {
      const snapshot = load()
      await renderLive(snapshot, `/live/nfl?vip=${String(vipOf(snapshot, 'Cubbiesftw23').entry_key)}`)

      expect(swingSubtitle()).toHaveTextContent('vs Cubbiesftw23')
      expect(swingRow('Parker Washington')).toHaveTextContent('HAVE')
    })

    it('follows the Train in focus on the Trains view', async () => {
      // The largest train (×312) rosters Lawrence, Brown, Love, Wilson, Washington and the Rams; the
      // next (×76) drops Brown.
      await renderLive(load(), '/live/nfl?view=trains')

      expect(swingSubtitle()).toHaveTextContent('vs ×312 train')
      for (const name of ['Chase Brown', 'Jeremiyah Love', 'Parker Washington']) {
        expect(swingRow(name)).toHaveTextContent('HAVE')
      }
      expect(swingRow("Ja'Marr Chase")).toHaveTextContent('FADE')

      fireEvent.click(within(screen.getByRole('navigation', { name: /live views/i })).getByRole('link', { name: /×76/ }))
      expect(swingSubtitle()).toHaveTextContent('vs ×76 train')
      expect(swingRow('Chase Brown')).toHaveTextContent('FADE')
      expect(swingRow('Jeremiyah Love')).toHaveTextContent('HAVE')
    })

    it('marks a padded DST name HAVE for the VIP rostering it', async () => {
      // The feed pads the VIP lineup's DST ("Rams ") but not the swing player ("Rams").
      const snapshot = load()
      await renderLive(snapshot, vipView(snapshot, 'EmpireMaker2'))

      expect(swingSubtitle()).toHaveTextContent('vs EmpireMaker2')
      expect(swingRow('Rams')).toHaveTextContent('HAVE')
      expect(swingRow('Cardinals')).toHaveTextContent('FADE')
    })

    it('lists swing players without HAVE or FADE when there is no lineup to compare with', async () => {
      // Every captured contest tracks VIPs, so this one tracks none.
      const snapshot = load()
      contestOf(snapshot).vip_lineups = []
      await renderLive(snapshot)

      expect(swingRow('Trevor Lawrence')).not.toHaveTextContent(/HAVE|FADE/)
      expect(swingSubtitle()).not.toHaveTextContent(/vs /)
    })

    it('says swing players are unavailable when the feed has no threat metrics', async () => {
      // Golf's metrics carry no `threat`.
      await renderLive(load(), '/live/golf')

      expect(section('Swing players').getByText('Swing players are unavailable for this contest.')).toBeInTheDocument()
    })

    it('says there are none for a present but empty list', async () => {
      const snapshot = load()
      contestOf(snapshot).metrics.threat.top_swing_players = []
      await renderLive(snapshot)

      expect(section('Swing players').getByText('No swing players right now.')).toBeInTheDocument()
      expect(section('Swing players').queryByText(/unavailable/i)).not.toBeInTheDocument()
    })
  })

  describe('leverage vs field', () => {
    it("shows each VIP's ownership remaining and uniqueness delta from the feed's leverage rows, captioned against the contest field", async () => {
      // Six VIPs below the standings cut, every leverage row partial.
      await renderLive(load(), '/live/nfl?view=vips')

      const leverage = section('Leverage vs field')
      const tuck = leverage.getByRole('group', { name: 'tuck8989' })
      expect(tuck).toHaveTextContent('202.82%')
      expect(tuck).toHaveTextContent('+44.07%')
      expect(tuck).toHaveTextContent('Partial')
      const empire = leverage.getByRole('group', { name: 'EmpireMaker2' })
      expect(empire).toHaveTextContent('373.51%')
      expect(empire).toHaveTextContent('−126.62%')
      expect(leverage.queryByText('Unavailable')).not.toBeInTheDocument()
      expect(leverage.getByText('Contest field avg remaining 246.89%')).toBeInTheDocument()
    })

    it("compares a VIP with the field using their leverage row's own figures, not the card's ownership remaining", async () => {
      // Hand-built divergence: the fixture's leverage rows agree with every other source. tuck8989 gets a
      // standings row (which the VIP card prefers) and a leverage row measured against a different field.
      const snapshot = load()
      const contest = contestOf(snapshot)
      const tuckKey = vipOf(snapshot, 'tuck8989').entry_key
      contest.standings.push({ entry_key: tuckKey, username: 'tuck8989', rank: 900, points: 50, pmr: 200, ownership_remaining_total_pct: 150 })
      const tuckRow = contest.metrics.threat.vip_vs_field_leverage.find((row: Json) => row.display_name === 'tuck8989')
      tuckRow.field_remaining_pct = 300
      await renderLive(snapshot, '/live/nfl?view=vips')

      const leverage = section('Leverage vs field')
      const tuck = leverage.getByRole('group', { name: 'tuck8989' })
      expect(tuck).toHaveTextContent('202.82%')
      expect(tuck).not.toHaveTextContent('150%')
      // The field marker sits further along tuck8989's bar than along a VIP's measured against the contest field.
      const fieldMarker = (group: HTMLElement) => parseFloat(group.querySelector<HTMLElement>('[aria-hidden="true"]')?.style.left ?? '')
      expect(fieldMarker(tuck)).toBeGreaterThan(fieldMarker(leverage.getByRole('group', { name: 'Aj_cray' })))
    })

    it('marks only partial leverage rows as partial', async () => {
      const snapshot = load()
      for (const row of contestOf(snapshot).metrics.threat.vip_vs_field_leverage) row.is_partial = row.display_name === 'tuck8989'
      await renderLive(snapshot, '/live/nfl?view=vips')

      const leverage = section('Leverage vs field')
      expect(leverage.getByRole('group', { name: 'tuck8989' })).toHaveTextContent('Partial')
      expect(leverage.getByRole('group', { name: 'Aj_cray' })).not.toHaveTextContent('Partial')
    })

    it("falls back to the ownership leaders' field average when the threat metrics give none", async () => {
      const snapshot = load()
      delete contestOf(snapshot).metrics.threat.field_remaining_pct
      await renderLive(snapshot)

      expect(section('Leverage vs field').getByText('Field avg remaining 246.89%')).toBeInTheDocument()
    })

    it('says a VIP ownership remaining is unavailable when the feed omits it', async () => {
      const snapshot = load()
      delete contestOf(snapshot).metrics.threat.vip_vs_field_leverage
      await renderLive(snapshot)

      expect(section('Leverage vs field').getByRole('group', { name: FIRST_VIP })).toHaveTextContent('Unavailable')
    })

    it('says the field average is unavailable when the feed gives none', async () => {
      const snapshot = load()
      delete contestOf(snapshot).ownership_watchlist
      delete contestOf(snapshot).metrics.threat.field_remaining_pct
      await renderLive(snapshot)

      const leverage = section('Leverage vs field')
      expect(leverage.getByText('Field average unavailable.')).toBeInTheDocument()
      expect(leverage.getByRole('group', { name: 'EmpireMaker2' })).toHaveTextContent('373.51%')
    })

    it('says no VIPs are tracked when there are none', async () => {
      const snapshot = load()
      contestOf(snapshot).vip_lineups = []
      await renderLive(snapshot)

      expect(section('Leverage vs field').getByText('No VIPs to compare with the field.')).toBeInTheDocument()
    })
  })

  describe('ownership leaders', () => {
    function leaderRows() {
      return section('Ownership leaders').getAllByRole('row').slice(1)
    }

    it('lists the leaders with rank, ownership remaining, PMR and rounded points', async () => {
      await renderLive(load())

      const leaders = section('Ownership leaders')
      for (const name of [/rank/i, /entry/i, /ownership remaining/i, /pmr/i, /pts/i]) {
        expect(leaders.getByRole('columnheader', { name })).toBeInTheDocument()
      }
      expect(leaderRows()).toHaveLength(10)
      expect(within(leaderRows()[0]).getAllByRole('cell').map((cell) => cell.textContent)).toEqual([
        '#183',
        'DrEvil1996',
        '387.77%',
        '300.0',
        '42.54',
      ])
      expect(within(leaderRows()[1]).getAllByRole('cell')[2]).toHaveTextContent('384.78%')
    })

    it('shows a dash for an entry whose ownership remaining the feed omits', async () => {
      const snapshot = load()
      delete contestOf(snapshot).ownership_watchlist.entries[0].ownership_remaining_pct
      await renderLive(snapshot)

      expect(within(leaderRows()[0]).getAllByRole('cell')[2]).toHaveTextContent('—')
    })

    it("respects the producer's top_n_default", async () => {
      // The captured watchlist sends no `top_n_default`.
      const snapshot = load()
      contestOf(snapshot).ownership_watchlist.top_n_default = 3
      await renderLive(snapshot)

      expect(leaderRows()).toHaveLength(3)
    })

    it('says there are none for a present but empty list, never "watchlist"', async () => {
      const snapshot = load()
      contestOf(snapshot).ownership_watchlist.entries = []
      await renderLive(snapshot)

      expect(section('Ownership leaders').getByText('No ownership leaders yet.')).toBeInTheDocument()
      expect(document.body.textContent).not.toMatch(/watchlist/i)
    })

    it('says the leaders are unavailable when the contest has none', async () => {
      // Golf has no ownership watchlist.
      await renderLive(load(), '/live/golf')

      expect(section('Ownership leaders').getByText('Ownership leaders are unavailable for this contest.')).toBeInTheDocument()
    })
  })
})

describe('the producer snapshot', () => {
  it('renders golf, which has no threat metrics or ownership leaders, in plain language', async () => {
    await renderLive(load(), '/live/golf')

    const bar = within(screen.getByRole('banner'))
    expect(bar.getByText('PGA TOUR Single Entry $10 Double Up')).toBeInTheDocument()
    expect(screen.getByRole('table', { name: /players/i })).toBeInTheDocument()
    expect(screen.getByText('Swing players are unavailable for this contest.')).toBeInTheDocument()
    expect(screen.getByText('Ownership leaders are unavailable for this contest.')).toBeInTheDocument()
    expectNoDeveloperDetails()
  })

  it('shows no internal identifiers or developer notes on any view', async () => {
    const snapshot = load()

    for (const path of ['/live/nfl', '/live/nfl?view=vips', '/live/nfl?view=trains', '/live/nfl?view=leverage']) {
      await renderLive(snapshot, path)
      expectNoDeveloperDetails()
      cleanup()
    }
  })

  it('never says unknown for values the snapshot does not carry', async () => {
    const snapshot = load()
    snapshot.sports.nfl.primary_contest.selection_reason = {}
    delete contestOf(snapshot).live_metrics.updated_at

    await renderLive(snapshot)

    expect(document.body.textContent).not.toMatch(/unknown/i)
  })

  it('follows a contest flagged is_primary over the configured key and id', async () => {
    const snapshot = load()
    const primary = contestOf(snapshot)
    primary.is_primary = true
    const decoy = structuredClone(primary)
    decoy.is_primary = false
    decoy.contest_id = '1002'
    decoy.contest_key = 'nfl:1002'
    decoy.name = 'Decoy Contest'
    snapshot.sports.nfl.contests.push(decoy)
    snapshot.sports.nfl.primary_contest.contest_id = '1002'
    snapshot.sports.nfl.primary_contest.contest_key = 'nfl:1002'

    await renderLive(snapshot)

    const bar = within(screen.getByRole('banner'))
    expect(bar.getByText('NFL GIANT $50 Double Up [Single Entry]')).toBeInTheDocument()
    expect(bar.queryByText('Decoy Contest')).not.toBeInTheDocument()
  })
})

describe('missing and empty sections', () => {
  it('says each missing section is unavailable and still renders the rest', async () => {
    const snapshot = load()
    const contest = contestOf(snapshot)
    delete contest.ownership_watchlist
    delete contest.train_clusters
    delete contest.standings
    delete contest.metrics

    await renderLive(snapshot)

    expect(screen.getByRole('table', { name: /players/i })).toBeInTheDocument()
    expect(screen.getByText('Swing players are unavailable for this contest.')).toBeInTheDocument()
    expect(screen.getByText('Ownership leaders are unavailable for this contest.')).toBeInTheDocument()
    const rail = within(screen.getByRole('navigation', { name: /live views/i }))
    expect(rail.getByRole('link', { name: /trains/i })).toHaveTextContent(/unavailable/i)
    expect(document.body.textContent).not.toMatch(/cluster/i)
    expectNoDeveloperDetails()
  })

  it('renders trains without naming riders when the standings are empty', async () => {
    const snapshot = load()
    contestOf(snapshot).standings = []

    await renderLive(snapshot, '/live/nfl?view=trains')

    expect(screen.getByRole('heading', { name: /^×312/ })).toBeInTheDocument()
    expect(screen.queryByText(/riding it/i)).not.toBeInTheDocument()
  })

  it('reads no rows from the pre-v3 standings object shape', async () => {
    const snapshot = load()
    contestOf(snapshot).standings = {
      updated_at: '2026-10-04T18:41:34Z',
      rows: [{ entry_key: 'old-row', username: 'Old Row', rank: 1, points: 10 }],
    }

    await renderLive(snapshot, '/live/nfl?view=trains')

    expect(screen.getByRole('heading', { name: /^×312/ })).toBeInTheDocument()
    expect(screen.queryByText(/old row/i)).not.toBeInTheDocument()
  })
})

describe('Players table edge cases', () => {
  it('drops players with no ownership, points or value', async () => {
    const snapshot = load()
    const zero = { ownership_pct: 0, fantasy_points: 0, value: 0 }
    setPlayers(snapshot, [
      { ...zero, name: 'Hidden Player' },
      { ...zero, name: 'Points Signal', fantasy_points: 1 },
      { ...zero, name: 'Ownership Signal', ownership_pct: 2 },
      { ...zero, name: 'Value Signal', value: 1 },
    ])

    await renderLive(snapshot)

    expect(within(playersTable()).queryByText('Hidden Player')).not.toBeInTheDocument()
    for (const name of ['Points Signal', 'Ownership Signal', 'Value Signal']) {
      expect(within(playersTable()).getByText(name)).toBeInTheDocument()
    }
  })

  it('trims ownership to two decimals', async () => {
    const snapshot = load()
    setPlayers(snapshot, [{ name: 'Precision Pool', ownership_pct: 26.97999999999997 }])

    await renderLive(snapshot)

    expect(within(playerRow('Precision Pool')).getByRole('cell', { name: '26.98%' })).toBeInTheDocument()
  })

  it('falls back to roster positions when position is missing', async () => {
    const snapshot = load()
    setPlayers(snapshot, [{ name: 'Roster Only', position: undefined, roster_positions: ['RB', 'S-FLEX'] }])

    await renderLive(snapshot)

    expect(within(playerRow('Roster Only')).getByRole('cell', { name: 'RB/S-FLEX' })).toBeInTheDocument()
  })

  it('shows a dash for a value the feed does not give as a number', async () => {
    const snapshot = load()
    setPlayers(snapshot, [{ name: 'Tier Unknown', value: '' }])

    await renderLive(snapshot)

    expect(within(playerRow('Tier Unknown')).getAllByRole('cell')[6]).toHaveTextContent('—')
  })
})
