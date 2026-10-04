import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { contestOf, load, location, rail, renderLive, setPlayers, setVips, stubPhone, type Json } from './liveHarness'

// The Live Train view: rail rows, the focused Train's stats, VIP overlap, riding entries and grouped
// lineup, plus the VIP view's overlap notice. Trains are injected over the producer fixture (cfb).

const LINEUP = 'Live Guy|Later Guy|Finished Guy|Fourth Guy|Fifth Guy|Sixth Guy|Seventh Guy|Eighth Guy'

const BIG = {
  cluster_id: 'big',
  cluster_rule: 'salary_remaining<=40000_and_same_points_pmr',
  user_count: 19,
  rank: 16,
  points: 198.254,
  pmr: 142.04,
  lineup_signature: LINEUP,
  entry_keys: ['k1', 'k2', 'k3'],
}
const SMALL = {
  cluster_id: 'small',
  cluster_rule: 'salary_remaining<=40000_and_same_points_pmr',
  user_count: 3,
  rank: 88,
  points: 120.5,
  pmr: 116,
  lineup_signature: 'Live Guy|Zed|Yan|Xi|Wu|Vu|Ut|Tu',
  entry_keys: ['k9'],
}

function setTrains(snapshot: Json, trains: Json[]) {
  contestOf(snapshot).train_clusters = trains
}

/** The pool behind the first three players of `LINEUP`. */
function setLineupPool(snapshot: Json) {
  setPlayers(snapshot, [
    { name: 'Live Guy', team: 'FSU', position: 'QB', matchup: 'FSU@MIZZ', game_status: 'In-Progress', fantasy_points: 12.5, ownership_pct: 31.5, value: 4.5 },
    { name: 'Later Guy', team: 'MIZZ', position: 'RB', game_status: 'FSU@MIZZ 07:30PM ET', fantasy_points: 0, ownership_pct: 12, value: null },
    { name: 'Finished Guy', team: 'FSU', position: 'WR', matchup: 'ISU@ARIZ', game_status: 'Final', fantasy_points: 30, ownership_pct: 55, value: 6.5 },
  ])
}

function setStandings(snapshot: Json) {
  contestOf(snapshot).standings = ['k1', 'k2', 'k3', 'k9'].map((entry_key, index) => ({
    entry_key,
    username: `rider-${entry_key}`,
    rank: index + 1,
  }))
}

const TRAINS = '/live/cfb?view=trains'

function chips() {
  return screen.getByRole('navigation', { name: /^trains$/i })
}

/** One of the focused Train's stats, a labelled group. */
function stat(label: string) {
  return within(screen.getByRole('group', { name: label }))
}

function trainHeading() {
  return screen.getByRole('heading', { name: /^×\d+/ })
}

describe('rail', () => {
  it('lists the largest trains with size, closeness, best rank and PMR', async () => {
    const snapshot = load()
    setTrains(snapshot, [SMALL, { ...BIG, min_shared_slots: 8 }])
    await renderLive(snapshot, '/live/cfb')

    const rows = within(rail()).getAllByRole('link', { name: /×\d+/ })
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('×19')
    expect(rows[0]).toHaveTextContent('identical')
    expect(rows[0]).toHaveTextContent('best #16')
    expect(rows[0]).toHaveTextContent('142.0 PMR')
    expect(rows[1]).toHaveTextContent('×3')
    expect(rows[1]).toHaveTextContent('best #88')
    expect(rows[1]).toHaveTextContent('116.0 PMR')
  })

  it('reads "share N of M" when the train is not identical', async () => {
    const snapshot = load()
    setTrains(snapshot, [{ ...BIG, min_shared_slots: 6 }])
    await renderLive(snapshot, '/live/cfb')

    const row = within(rail()).getByRole('link', { name: /×19/ })
    expect(row).toHaveTextContent('share 6 of 8')
    expect(row).not.toHaveTextContent('identical')
  })

  it('shows only the size when the producer sends no min_shared_slots', async () => {
    const snapshot = load()
    setTrains(snapshot, [BIG])
    await renderLive(snapshot, '/live/cfb')

    const row = within(rail()).getByRole('link', { name: /×19/ })
    expect(row).toHaveTextContent('best #16')
    expect(row).not.toHaveTextContent(/identical|share \d/i)
  })

  it('lists only the largest trains, six at most', async () => {
    const snapshot = load()
    setTrains(
      snapshot,
      Array.from({ length: 8 }, (_, index) => ({ ...BIG, cluster_id: `t${index}`, user_count: 10 + index, rank: index + 1 })),
    )
    await renderLive(snapshot, '/live/cfb')

    const rows = within(rail()).getAllByRole('link', { name: /×\d+/ })
    expect(rows.map((row) => row.textContent?.match(/×\d+/)?.[0])).toEqual(['×17', '×16', '×15', '×14', '×13', '×12'])
  })

  it('opens a train from its rail row and keeps it in the URL', async () => {
    const snapshot = load()
    setTrains(snapshot, [BIG, SMALL])
    await renderLive(snapshot, '/live/cfb')

    fireEvent.click(within(rail()).getByRole('link', { name: /×3/ }))

    expect(location()).toBe('/live/cfb?view=trains&train=small')
    expect(trainHeading()).toHaveTextContent('×3')
    expect(within(rail()).getByRole('link', { name: /×3/ })).toHaveAttribute('aria-current', 'page')
    expect(within(rail()).getByRole('link', { name: /×19/ })).not.toHaveAttribute('aria-current')
  })

  it('still offers the Trains view, saying there are none, when the contest has no trains', async () => {
    const snapshot = load()
    setTrains(snapshot, [])
    await renderLive(snapshot, '/live/cfb')

    fireEvent.click(within(rail()).getByRole('link', { name: /^trains/i }))

    expect(location()).toBe('/live/cfb?view=trains')
    expect(screen.getByText(/no trains available/i)).toBeInTheDocument()
  })
})

describe('Train view focus', () => {
  it('focuses the largest train when the URL names none', async () => {
    const snapshot = load()
    setTrains(snapshot, [SMALL, BIG])
    await renderLive(snapshot, TRAINS)

    expect(trainHeading()).toHaveTextContent('×19')
  })

  it('focuses the train named in the URL, as for a shared link or a reload', async () => {
    const snapshot = load()
    setTrains(snapshot, [BIG, SMALL])
    await renderLive(snapshot, '/live/cfb?view=trains&train=small')

    expect(trainHeading()).toHaveTextContent('×3')
  })

  it('falls back to the largest train for an unknown id', async () => {
    const snapshot = load()
    setTrains(snapshot, [BIG, SMALL])
    await renderLive(snapshot, '/live/cfb?view=trains&train=nope')

    expect(trainHeading()).toHaveTextContent('×19')
  })

  it('shows a train named in the URL that is outside the largest six, active in the rail', async () => {
    const snapshot = load()
    setTrains(
      snapshot,
      Array.from({ length: 8 }, (_, index) => ({ ...BIG, cluster_id: `t${index}`, user_count: 10 + index, rank: index + 1 })),
    )
    await renderLive(snapshot, '/live/cfb?view=trains&train=t0')

    expect(trainHeading()).toHaveTextContent('×10')
    expect(within(rail()).getByRole('link', { name: /×10/ })).toHaveAttribute('aria-current', 'page')
  })
})

describe('Train stats', () => {
  it('shows size with the closeness label', async () => {
    const snapshot = load()
    setTrains(snapshot, [{ ...BIG, min_shared_slots: 8 }])
    await renderLive(snapshot, TRAINS)

    expect(trainHeading()).toHaveTextContent('×19 · identical')
  })

  it('shows size with "share N of M"', async () => {
    const snapshot = load()
    setTrains(snapshot, [{ ...BIG, min_shared_slots: 5 }])
    await renderLive(snapshot, TRAINS)

    expect(trainHeading()).toHaveTextContent('×19 · share 5 of 8')
  })

  it('shows size alone when the producer sends no min_shared_slots', async () => {
    const snapshot = load()
    setTrains(snapshot, [BIG])
    await renderLive(snapshot, TRAINS)

    expect(trainHeading()).toHaveTextContent(/^×19$/)
  })

  it('shows best rank out of the field size, points and PMR with rounded numbers', async () => {
    const snapshot = load()
    setTrains(snapshot, [BIG])
    await renderLive(snapshot, TRAINS)

    expect(stat('Best rank').getByText('#16')).toBeInTheDocument()
    expect(stat('Best rank').getByText('of 229')).toBeInTheDocument()
    expect(stat('Points').getByText('198.25')).toBeInTheDocument()
    expect(stat('PMR').getByText('142.0')).toBeInTheDocument()
  })

  it('shows dashes for values the feed omits', async () => {
    const snapshot = load()
    setTrains(snapshot, [{ cluster_id: 'bare', user_count: 4, lineup_signature: LINEUP }])
    await renderLive(snapshot, TRAINS)

    expect(stat('Best rank').getByText('—')).toBeInTheDocument()
    expect(stat('Points').getByText('—')).toBeInTheDocument()
    expect(stat('PMR').getByText('—')).toBeInTheDocument()
  })

  it('never says unknown', async () => {
    const snapshot = load()
    setTrains(snapshot, [{ cluster_id: 'bare', user_count: 4 }])
    await renderLive(snapshot, TRAINS)

    expect(screen.queryByText(/unknown/i)).not.toBeInTheDocument()
  })
})

describe('VIP overlap', () => {
  it('shows how many players each VIP shares with the train', async () => {
    const snapshot = load()
    setTrains(snapshot, [BIG])
    setVips(snapshot, [
      { key: 'v1', name: 'First VIP', players: ['Live Guy', 'Later Guy', 'Finished Guy', 'Fourth Guy', 'Fifth Guy', 'Other'] },
      { key: 'v2', name: 'Second VIP', players: ['Live Guy', 'Nobody'] },
    ])
    await renderLive(snapshot, TRAINS)

    const overlaps = screen.getByRole('list', { name: /vips sharing this train/i })
    expect(within(overlaps).getByText(/First VIP/)).toBeInTheDocument()
    expect(within(overlaps).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      expect.stringContaining('shares 5/8'),
      expect.stringContaining('shares 1/8'),
    ])
  })

  it('omits the overlap row when there are no VIPs', async () => {
    const snapshot = load()
    setTrains(snapshot, [BIG])
    await renderLive(snapshot, TRAINS)

    expect(screen.queryByRole('list', { name: /vips sharing this train/i })).not.toBeInTheDocument()
  })
})

describe('lineup', () => {
  it('groups the train lineup by game status, with points and ownership from the pool', async () => {
    const snapshot = load()
    setTrains(snapshot, [BIG])
    setLineupPool(snapshot)
    await renderLive(snapshot, TRAINS)

    const playing = screen.getByRole('region', { name: /^playing now/i })
    expect(within(playing).getByText('Live Guy')).toBeInTheDocument()
    expect(within(playing).getByText('12.50')).toBeInTheDocument()
    expect(within(playing).getByText('31.5% own')).toBeInTheDocument()
    expect(within(playing).getByText('QB')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: /^done/i })).getByText('Finished Guy')).toBeInTheDocument()
    const yet = screen.getByRole('region', { name: /^yet to play/i })
    expect(within(yet).getByText('Later Guy')).toBeInTheDocument()
    // Players the pool does not carry have no status, so they wait with the pre-game players.
    expect(within(yet).getByText('Fourth Guy')).toBeInTheDocument()
  })

  it("shows each player's matchup from the player pool", async () => {
    const snapshot = load()
    setTrains(snapshot, [BIG])
    setLineupPool(snapshot)
    await renderLive(snapshot, TRAINS)

    expect(within(screen.getByRole('region', { name: /^playing now/i })).getByText('FSU@MIZZ')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: /^done/i })).getByText('ISU@ARIZ')).toBeInTheDocument()
  })

  it('leaves the matchup out when the feed sends only the game status in it', async () => {
    const snapshot = load()
    setTrains(snapshot, [BIG])
    setPlayers(snapshot, [{ name: 'Live Guy', game_status: 'In-Progress', matchup: 'In-Progress' }])
    await renderLive(snapshot, TRAINS)

    expect(within(screen.getByRole('region', { name: /^playing now/i })).getAllByText('In-Progress')).toHaveLength(1)
  })

  it('shows locked slots as locked, not as a pipe-joined signature', async () => {
    const snapshot = load()
    setTrains(snapshot, [{ ...BIG, lineup_signature: 'LOCKED 🔒|Live Guy' }])
    setLineupPool(snapshot)
    await renderLive(snapshot, TRAINS)

    expect(screen.getByText('Locked 🔒')).toBeInTheDocument()
    expect(screen.queryByText(/LOCKED/)).not.toBeInTheDocument()
  })

  it('says so when the train has no lineup', async () => {
    const snapshot = load()
    setTrains(snapshot, [{ ...BIG, lineup_signature: ' | ' }])
    await renderLive(snapshot, TRAINS)

    expect(screen.getByText(/no lineup is available for this train/i)).toBeInTheDocument()
  })
})

describe('riding entries', () => {
  it('names a few entries riding the train, from the standings, with the rest counted', async () => {
    const snapshot = load()
    setTrains(snapshot, [BIG])
    setStandings(snapshot)
    await renderLive(snapshot, TRAINS)

    expect(screen.getByText(/riding it: rider-k1, rider-k2, rider-k3 \+16 more/i)).toBeInTheDocument()
  })

  it('shows at most eight names', async () => {
    const snapshot = load()
    const keys = Array.from({ length: 12 }, (_, index) => `e${index}`)
    setTrains(snapshot, [{ ...BIG, user_count: 12, entry_keys: keys }])
    contestOf(snapshot).standings = keys.map((entry_key, index) => ({ entry_key, username: `name${index}`, rank: index + 1 }))
    await renderLive(snapshot, TRAINS)

    expect(screen.getByText(/name0, name1, name2, name3, name4, name5, name6, name7 \+4 more/)).toBeInTheDocument()
  })

  it('leaves the line out when no riders can be named', async () => {
    const snapshot = load()
    setTrains(snapshot, [BIG])
    delete contestOf(snapshot).standings
    await renderLive(snapshot, TRAINS)

    expect(screen.queryByText(/riding it/i)).not.toBeInTheDocument()
  })
})

describe('unavailable and empty states', () => {
  it('says train data is unavailable when the contest has no train_clusters', async () => {
    const snapshot = load()
    delete contestOf(snapshot).train_clusters
    await renderLive(snapshot, TRAINS)

    expect(screen.getByText(/train data unavailable for this contest/i)).toBeInTheDocument()
    expect(within(rail()).getByRole('link', { name: /^trains/i })).toHaveTextContent('unavailable')
  })

  it('says train data is unavailable when every row is malformed', async () => {
    const snapshot = load()
    setTrains(snapshot, [null, 'invalid-row', { cluster_id: 123, user_count: 'x' }, { entry_keys: [42] }])
    await renderLive(snapshot, TRAINS)

    expect(screen.getByText(/train data unavailable for this contest/i)).toBeInTheDocument()
  })

  it('says there are no trains for a present but empty list', async () => {
    const snapshot = load()
    setTrains(snapshot, [])
    await renderLive(snapshot, TRAINS)

    expect(screen.getByText(/no trains available/i)).toBeInTheDocument()
    expect(screen.queryByText(/unavailable for this contest/i)).not.toBeInTheDocument()
  })

  it('does not accept the pre-v3 train_clusters object shape', async () => {
    const snapshot = load()
    contestOf(snapshot).train_clusters = {
      updated_at: '2026-10-03T20:48:31Z',
      cluster_rule: { type: 'shared_slots', min_shared: 8 },
      clusters: [{ cluster_key: 'old', entry_count: 9, composition: [{ slot: 'QB', player_name: 'Old Shape' }] }],
    }
    await renderLive(snapshot, TRAINS)

    expect(screen.getByText(/train data unavailable for this contest/i)).toBeInTheDocument()
    expect(screen.queryByText(/Old Shape/)).not.toBeInTheDocument()
  })

  it('has no cluster wording anywhere', async () => {
    const snapshot = load()
    setTrains(snapshot, [BIG])
    await renderLive(snapshot, TRAINS)

    expect(screen.queryByText(/cluster/i)).not.toBeInTheDocument()
  })
})

describe('on a phone', () => {
  it('replaces the rail with a chip row that switches trains', async () => {
    stubPhone()
    const snapshot = load()
    setTrains(snapshot, [{ ...BIG, min_shared_slots: 8 }, SMALL])
    await renderLive(snapshot, TRAINS)

    expect(screen.queryByRole('navigation', { name: /live views/i })).not.toBeInTheDocument()
    expect(trainHeading()).toHaveTextContent('×19')
    expect(within(chips()).getByRole('link', { name: /×19/ })).toHaveAttribute('aria-current', 'page')
    expect(within(chips()).getByRole('link', { name: /×19/ })).toHaveTextContent('identical')

    fireEvent.click(within(chips()).getByRole('link', { name: /×3/ }))

    expect(location()).toBe('/live/cfb?view=trains&train=small')
    expect(trainHeading()).toHaveTextContent('×3')
    expect(within(chips()).getByRole('link', { name: /×3/ })).toHaveAttribute('aria-current', 'page')
  })

  it('shows chips with the size alone when the producer sends no min_shared_slots', async () => {
    stubPhone()
    const snapshot = load()
    setTrains(snapshot, [BIG, SMALL])
    await renderLive(snapshot, TRAINS)

    expect(within(chips()).getByRole('link', { name: /×19/ })).not.toHaveTextContent(/identical|share/i)
  })
})

describe('VIP view overlap notice', () => {
  function vipPath(snapshot: Json, vipPlayers: string[], trains: Json[] = [BIG]) {
    setTrains(snapshot, trains)
    setVips(snapshot, [{ key: 'v1', name: 'First VIP', players: vipPlayers }])
    return '/live/cfb?view=vips'
  }

  it('links to the train when the VIP shares 4 or more players with it', async () => {
    const snapshot = load()
    const path = vipPath(snapshot, ['Live Guy', 'Later Guy', 'Finished Guy', 'Fourth Guy', 'A', 'B', 'C', 'D'])
    await renderLive(snapshot, path)

    const notice = screen.getByRole('link', { name: /shared with a ×19 train/i })
    expect(notice).toHaveTextContent('4/8')
    expect(notice).toHaveTextContent('best #16')
    expect(notice).toHaveAttribute('href', '/live/cfb?view=trains&train=big')
  })

  it('goes to the train when followed', async () => {
    const snapshot = load()
    const path = vipPath(snapshot, ['Live Guy', 'Later Guy', 'Finished Guy', 'Fourth Guy', 'A', 'B', 'C', 'D'])
    await renderLive(snapshot, path)

    fireEvent.click(screen.getByRole('link', { name: /shared with a ×19 train/i }))

    expect(location()).toBe('/live/cfb?view=trains&train=big')
    expect(trainHeading()).toHaveTextContent('×19')
  })

  it('names the train that shares the most players', async () => {
    const snapshot = load()
    const path = vipPath(snapshot, ['Live Guy', 'Zed', 'Yan', 'Xi', 'Wu', 'Vu', 'A', 'B'], [BIG, SMALL])
    await renderLive(snapshot, path)

    expect(screen.getByRole('link', { name: /shared with a ×3 train/i })).toHaveTextContent('6/8')
  })

  it('stays out of the way below 4 shared players', async () => {
    const snapshot = load()
    const path = vipPath(snapshot, ['Live Guy', 'Later Guy', 'Finished Guy', 'A', 'B', 'C', 'D', 'E'])
    await renderLive(snapshot, path)

    expect(screen.queryByRole('link', { name: /shared with a/i })).not.toBeInTheDocument()
  })
})

describe('against the producer snapshot', () => {
  it('shows a train with rounded points and PMR and its best rank out of the field', async () => {
    const snapshot = load()
    const train = contestOf(snapshot).train_clusters.find((cluster: Json) => cluster.rank === 8)
    await renderLive(snapshot, `/live/cfb?view=trains&train=${train.cluster_id}`)

    expect(trainHeading()).toHaveTextContent('×3')
    expect(stat('Best rank').getByText('#8')).toBeInTheDocument()
    expect(stat('Points').getByText('177.52')).toBeInTheDocument()
    expect(stat('PMR').getByText('119.8')).toBeInTheDocument()
  })

  it('shows locked slots of a train in lineup position', async () => {
    await renderLive(load(), '/live/mlb?view=trains')

    expect(screen.getAllByText('Locked 🔒')).toHaveLength(3)
    expect(screen.getByText('Parker Messick')).toBeInTheDocument()
    expect(screen.queryByText(/LOCKED/)).not.toBeInTheDocument()
  })

  it('opens the largest train first, in the rail and the view', async () => {
    await renderLive(load(), '/live/mlb?view=trains')

    const [largest] = within(rail()).getAllByRole('link', { name: /×\d+/ })
    expect(largest).toHaveAttribute('aria-current', 'page')
    expect(largest).toHaveTextContent('×18')
    expect(trainHeading()).toHaveTextContent('×18')
  })
})
