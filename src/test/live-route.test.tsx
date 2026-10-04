import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import nflSnapshot from '../../public/mock/snapshots/live-2026-10-04T18-41-34Z.json'
import { contestOf, load, renderLive, setPlayers, setVips, stubPhone, type Json, type VipSpec } from './liveHarness'

// The Live route as a whole: states where there is nothing to render, the plain-language rules,
// and edge cases of the producer fixture (no primary contest, missing sections, empty standings).
// cfb carries `metrics.threat`; mlb carries no `metrics` at all (the missing-metrics variant).
// The producer fixture has no VIP lineups, so tests that need them inject minimal ones.

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
  expect(text).not.toMatch(/196178015|196293731/)
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
    delete snapshot.sports.cfb.primary_contest

    await renderLive(snapshot)

    expect(screen.getByText(/no primary contest is set for CFB/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /all CFB contests/i })).toHaveAttribute('href', '/sport/cfb')
    expectNoDeveloperDetails()
  })

  it('says the primary contest is missing from the snapshot without naming its key or id', async () => {
    const snapshot = load()
    snapshot.sports.cfb.primary_contest.contest_key = 'cfb:777'
    snapshot.sports.cfb.primary_contest.contest_id = '777'

    await renderLive(snapshot)

    expect(screen.getByText(/the primary contest for CFB is not in this snapshot/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /all CFB contests/i })).toHaveAttribute('href', '/sport/cfb')
    expect(document.body).not.toHaveTextContent('777')
    expectNoDeveloperDetails()
  })
})

describe('hot and cold markers', () => {
  function playersTable() {
    return screen.getByRole('table', { name: /players/i })
  }

  function playerRow(name: string) {
    return within(playersTable()).getByRole('row', { name: new RegExp(name) })
  }

  /** A lineup player card: the list item naming the player. */
  function lineupCard(name: string) {
    const card = screen.getAllByRole('listitem').find((item) => within(item).queryByText(name))
    if (!card) throw new Error(`No lineup card for ${name}`)
    return within(card)
  }

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
    await renderLive(iconSnapshot(), '/live/cfb?view=vips')

    expect(lineupCard('Hot Guy').getByRole('img', { name: /hot/i })).toHaveTextContent('🔥')
    expect(lineupCard('Cold Guy').getByRole('img', { name: /cold/i })).toHaveTextContent('❄️')
    expect(lineupCard('Plain Guy').queryByRole('img')).not.toBeInTheDocument()
  })

  it('marks Train lineup players with the icon from the player pool', async () => {
    await renderLive(iconSnapshot(), '/live/cfb?view=trains')

    expect(lineupCard('Hot Guy').getByRole('img', { name: /hot/i })).toHaveTextContent('🔥')
    expect(lineupCard('Cold Guy').getByRole('img', { name: /cold/i })).toHaveTextContent('❄️')
    expect(lineupCard('Plain Guy').queryByRole('img')).not.toBeInTheDocument()
  })

  it('shows no markers anywhere when the feed provides no value icon', async () => {
    const snapshot = load()
    setVips(snapshot, [{ key: 'vip-a', name: 'First VIP', players: ['Ashton Daniels', 'Ousmane Kromah'] }])

    for (const path of ['/live/cfb', '/live/cfb?view=vips', '/live/cfb?view=trains']) {
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

  // cfb swing players (most owned first): Ousmane Kromah, Duce Robinson, Cayden Lee, Jeremiah Smith, ...
  const FIRST: VipSpec = { key: 'vip-a', name: 'First VIP', players: ['Ousmane Kromah', 'Cayden Lee'], ownLeft: 210.25 }
  const SECOND: VipSpec = { key: 'vip-b', name: 'Second VIP', players: ['Duce Robinson'], ownLeft: 95.5 }

  function withVips(): Json {
    const snapshot = load()
    setVips(snapshot, [FIRST, SECOND])
    return snapshot
  }

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
      await renderLive(load(), '/live/cfb?view=leverage')

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
      expect(names[0]).toMatch(/Ousmane Kromah.*79\.11%/)
      expect(names[1]).toMatch(/Duce Robinson.*74\.68%/)
      expect(names).toHaveLength(10)
    })

    it('marks each HAVE or FADE against the first VIP by default', async () => {
      await renderLive(withVips())

      expect(swingSubtitle()).toHaveTextContent('vs First VIP')
      expect(swingRow('Ousmane Kromah')).toHaveTextContent('HAVE')
      expect(swingRow('Cayden Lee')).toHaveTextContent('HAVE')
      expect(swingRow('Duce Robinson')).toHaveTextContent('FADE')
    })

    it('follows the VIP in focus on the VIPs view', async () => {
      await renderLive(withVips(), '/live/cfb?view=vips&vip=vip-b')

      expect(swingSubtitle()).toHaveTextContent('vs Second VIP')
      expect(swingRow('Duce Robinson')).toHaveTextContent('HAVE')
      expect(swingRow('Ousmane Kromah')).toHaveTextContent('FADE')
    })

    it('keeps following the VIP named in the link on the Players view', async () => {
      await renderLive(withVips(), '/live/cfb?vip=vip-b')

      expect(swingRow('Duce Robinson')).toHaveTextContent('HAVE')
    })

    it('follows the Train in focus on the Trains view', async () => {
      const snapshot = withVips()
      setTrains(snapshot, [
        { id: 'big', size: 19, players: ['Jeremiah Smith', 'Duce Robinson'] },
        { id: 'small', size: 3, players: ['Matt Fuller'] },
      ])
      await renderLive(snapshot, '/live/cfb?view=trains&vip=vip-a')

      expect(swingSubtitle()).toHaveTextContent('vs ×19 train')
      expect(swingRow('Jeremiah Smith')).toHaveTextContent('HAVE')
      expect(swingRow('Duce Robinson')).toHaveTextContent('HAVE')
      expect(swingRow('Ousmane Kromah')).toHaveTextContent('FADE')

      fireEvent.click(within(screen.getByRole('navigation', { name: /live views/i })).getByRole('link', { name: /×3/ }))
      expect(swingRow('Matt Fuller')).toHaveTextContent('HAVE')
      expect(swingRow('Jeremiah Smith')).toHaveTextContent('FADE')
    })

    it('lists swing players without HAVE or FADE when there is no lineup to compare with', async () => {
      await renderLive(load())

      expect(swingRow('Ousmane Kromah')).not.toHaveTextContent(/HAVE|FADE/)
      expect(swingSubtitle()).not.toHaveTextContent(/vs /)
    })

    it('says swing players are unavailable when the feed has no threat metrics', async () => {
      await renderLive(load(), '/live/mlb')

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
    it("compares each VIP's ownership remaining with the field average", async () => {
      await renderLive(withVips())

      const leverage = section('Leverage vs field')
      expect(leverage.getByRole('group', { name: 'First VIP' })).toHaveTextContent('210.25%')
      expect(leverage.getByRole('group', { name: 'Second VIP' })).toHaveTextContent('95.5%')
      expect(leverage.getByText('Field avg remaining 146.47%')).toBeInTheDocument()
    })

    it("shows each VIP's uniqueness delta from the feed's leverage rows, captioned against the contest field", async () => {
      // The captured NFL slate: six VIPs below the standings cut, every leverage row partial.
      await renderLive(nflSnapshot, '/live/nfl?view=vips')

      const leverage = section('Leverage vs field')
      const tuck = leverage.getByRole('group', { name: 'tuck8989' })
      expect(tuck).toHaveTextContent('202.82%')
      expect(tuck).toHaveTextContent('+44.07%')
      expect(tuck).toHaveTextContent('Partial')
      expect(leverage.getByRole('group', { name: 'EmpireMaker2' })).toHaveTextContent('−126.62%')
      expect(leverage.queryByText('Unavailable')).not.toBeInTheDocument()
      expect(leverage.getByText('Contest field avg remaining 246.89%')).toBeInTheDocument()
    })

    it('marks only partial leverage rows as partial', async () => {
      const snapshot = structuredClone(nflSnapshot) as Json
      const rows = contestOf(snapshot, 'nfl').metrics.threat.vip_vs_field_leverage
      for (const row of rows) row.is_partial = row.display_name === 'tuck8989'
      await renderLive(snapshot, '/live/nfl?view=vips')

      const leverage = section('Leverage vs field')
      expect(leverage.getByRole('group', { name: 'tuck8989' })).toHaveTextContent('Partial')
      expect(leverage.getByRole('group', { name: 'Aj_cray' })).not.toHaveTextContent('Partial')
    })

    it('says a VIP ownership remaining is unavailable when the feed omits it', async () => {
      const snapshot = load()
      setVips(snapshot, [{ key: 'vip-a', name: 'First VIP', players: [] }])
      await renderLive(snapshot)

      expect(section('Leverage vs field').getByRole('group', { name: 'First VIP' })).toHaveTextContent('Unavailable')
    })

    it('says the field average is unavailable when the feed gives none', async () => {
      const snapshot = withVips()
      delete contestOf(snapshot).ownership_watchlist
      await renderLive(snapshot)

      const leverage = section('Leverage vs field')
      expect(leverage.getByText('Field average unavailable.')).toBeInTheDocument()
      expect(leverage.getByRole('group', { name: 'First VIP' })).toHaveTextContent('210.25%')
    })

    it('says no VIPs are tracked when there are none', async () => {
      await renderLive(load())

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
        '#142',
        'bruc0074',
        '272.07%',
        '231.8',
        '113.18',
      ])
      expect(within(leaderRows()[1]).getAllByRole('cell')[2]).toHaveTextContent('255.05%')
    })

    it('shows a dash for an entry whose ownership remaining the feed omits', async () => {
      const snapshot = load()
      delete contestOf(snapshot).ownership_watchlist.entries[0].ownership_remaining_pct
      await renderLive(snapshot)

      expect(within(leaderRows()[0]).getAllByRole('cell')[2]).toHaveTextContent('—')
    })

    it("respects the producer's top_n_default", async () => {
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
      const snapshot = load()
      delete contestOf(snapshot).ownership_watchlist
      await renderLive(snapshot)

      expect(section('Ownership leaders').getByText('Ownership leaders are unavailable for this contest.')).toBeInTheDocument()
    })
  })
})

describe('the producer snapshot', () => {
  it('renders the missing-metrics sport in plain language, with no developer notes', async () => {
    await renderLive(load(), '/live/mlb')

    const bar = within(screen.getByRole('banner'))
    expect(bar.getByText('MLB Single Entry $5 Double Up')).toBeInTheDocument()
    expect(screen.getByRole('table', { name: /players/i })).toBeInTheDocument()
    expect(screen.getByText('Swing players are unavailable for this contest.')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Ownership leaders' })).getAllByRole('row').length).toBeGreaterThan(1)
    expectNoDeveloperDetails()
  })

  it('shows no internal identifiers or developer notes on any view', async () => {
    const snapshot = load()
    setVips(snapshot, [{ key: 'vip-a', name: 'First VIP', players: ['Ashton Daniels'] }])

    for (const path of ['/live/cfb', '/live/cfb?view=vips', '/live/cfb?view=trains', '/live/cfb?view=leverage']) {
      await renderLive(snapshot, path)
      expectNoDeveloperDetails()
      cleanup()
    }
  })

  it('never says unknown for values the snapshot does not carry', async () => {
    const snapshot = load()
    snapshot.sports.cfb.primary_contest.selection_reason = {}
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
    decoy.contest_key = 'cfb:1002'
    decoy.name = 'Decoy Contest'
    snapshot.sports.cfb.contests.push(decoy)
    snapshot.sports.cfb.primary_contest.contest_id = '1002'
    snapshot.sports.cfb.primary_contest.contest_key = 'cfb:1002'

    await renderLive(snapshot)

    const bar = within(screen.getByRole('banner'))
    expect(bar.getByText('CFB Single Entry $25 Double Up')).toBeInTheDocument()
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

    await renderLive(snapshot, '/live/cfb?view=trains')

    expect(screen.getByRole('heading', { name: /^×17/ })).toBeInTheDocument()
    expect(screen.queryByText(/riding it/i)).not.toBeInTheDocument()
  })

  it('reads no rows from the pre-v3 standings object shape', async () => {
    const snapshot = load()
    contestOf(snapshot).standings = {
      updated_at: '2026-10-03T20:48:31Z',
      rows: [{ entry_key: 'old-row', username: 'Old Row', rank: 1, points: 10 }],
    }

    await renderLive(snapshot, '/live/cfb?view=trains')

    expect(screen.getByRole('heading', { name: /^×17/ })).toBeInTheDocument()
    expect(screen.queryByText(/old row/i)).not.toBeInTheDocument()
  })
})

describe('Players table edge cases', () => {
  function playersTable() {
    return screen.getByRole('table', { name: /players/i })
  }

  function playerRow(name: string) {
    return within(playersTable()).getByRole('row', { name: new RegExp(name) })
  }

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
