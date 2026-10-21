import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { contestOf, load, location, rail, renderLive, setVips, stubPhone, vipOf, type Json } from './liveHarness'
import { BIG, SMALL, TRAINS, chips, setStandings, setTrains, stat, trainHeading } from './liveTrainTestKit'

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
    contestOf(snapshot).standings = keys.map((entry_key, index) => ({
      entry_key,
      username: `name${index}`,
      rank: index + 1,
    }))
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
      updated_at: '2026-10-04T18:41:34Z',
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

    expect(location()).toBe('/live/nfl?view=trains&train=small')
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
    return '/live/nfl?view=vips'
  }

  it('links to the train when the VIP shares 4 or more players with it', async () => {
    const snapshot = load()
    const path = vipPath(snapshot, ['Live Guy', 'Later Guy', 'Finished Guy', 'Fourth Guy', 'A', 'B', 'C', 'D'])
    await renderLive(snapshot, path)

    const notice = screen.getByRole('link', { name: /shared with a ×19 train/i })
    expect(notice).toHaveTextContent('4/8')
    expect(notice).toHaveTextContent('best #16')
    expect(notice).toHaveAttribute('href', '/live/nfl?view=trains&train=big')
  })

  it('goes to the train when followed', async () => {
    const snapshot = load()
    const path = vipPath(snapshot, ['Live Guy', 'Later Guy', 'Finished Guy', 'Fourth Guy', 'A', 'B', 'C', 'D'])
    await renderLive(snapshot, path)

    fireEvent.click(screen.getByRole('link', { name: /shared with a ×19 train/i }))

    expect(location()).toBe('/live/nfl?view=trains&train=big')
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
  // The largest captured train: ×312 entries on the same lineup, ranked #511 with 30.94 points and PMR 360.
  // It rosters Lawrence, Brown, Love, Wilson, Washington and the Rams, with three slots locked.
  const LARGEST = '/live/nfl?view=trains'

  it('shows a train with rounded points and PMR and its best rank out of the field', async () => {
    await renderLive(load(), LARGEST)

    expect(trainHeading()).toHaveTextContent(/^×312$/)
    expect(stat('Best rank').getByText('#511')).toBeInTheDocument()
    expect(stat('Best rank').getByText('of 1136')).toBeInTheDocument()
    expect(stat('Points').getByText('30.94')).toBeInTheDocument()
    expect(stat('PMR').getByText('360.0')).toBeInTheDocument()
  })

  it('shows locked slots of a train in lineup position', async () => {
    await renderLive(load(), LARGEST)

    const playing = within(screen.getByRole('region', { name: /^playing now/i }))
    for (const name of [
      'Trevor Lawrence',
      'Chase Brown',
      'Jeremiyah Love',
      'Garrett Wilson',
      'Parker Washington',
      'Rams',
    ]) {
      expect(playing.getByText(name)).toBeInTheDocument()
    }
    expect(screen.getAllByText('Locked 🔒')).toHaveLength(3)
    expect(screen.queryByText(/LOCKED/)).not.toBeInTheDocument()
  })

  it('opens the largest train first, in the rail and the view', async () => {
    await renderLive(load(), LARGEST)

    const [largest] = within(rail()).getAllByRole('link', { name: /×\d+/ })
    expect(largest).toHaveAttribute('aria-current', 'page')
    expect(largest).toHaveTextContent('×312')
    expect(trainHeading()).toHaveTextContent('×312')
  })

  it('shows only the size when the captured train has no min_shared_slots', async () => {
    await renderLive(load(), LARGEST)

    expect(trainHeading()).toHaveTextContent(/^×312$/)
    expect(within(rail()).getAllByRole('link', { name: /×\d+/ })[0]).not.toHaveTextContent(/identical|share \d/i)
  })

  it('lists the six largest trains in the rail, biggest first', async () => {
    await renderLive(load(), '/live/nfl')

    const rows = within(rail()).getAllByRole('link', { name: /×\d+/ })
    expect(rows.map((row) => row.textContent?.match(/×\d+/)?.[0])).toEqual(['×312', '×76', '×16', '×15', '×15', '×11'])
  })

  it('shows the VIPs who ride the largest train, with how many players they share', async () => {
    // EmpireMaker2 sits on this train's exact lineup (six players); the other VIPs share four or five.
    await renderLive(load(), LARGEST)

    const overlaps = screen.getByRole('list', { name: /vips sharing this train/i })
    const items = within(overlaps).getAllByRole('listitem')
    expect(items.length).toBeGreaterThan(0)
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining('cglenn91shares 4/9'),
      expect.stringContaining('Cubbiesftw23shares 5/9'),
      expect.stringContaining('tuck8989shares 4/9'),
      expect.stringContaining('EmpireMaker2shares 6/9'),
      expect.stringContaining('Aj_crayshares 4/9'),
      expect.stringContaining('Mcoleman1902shares 5/9'),
    ])
  })

  it('links a VIP to the captured train it shares players with', async () => {
    const snapshot = load()
    await renderLive(snapshot, `/live/nfl?view=vips&vip=${String(vipOf(snapshot, 'EmpireMaker2').entry_key)}`)

    const notice = screen.getByRole('link', { name: /shared with a ×312 train/i })
    expect(notice).toHaveAttribute(
      'href',
      `/live/nfl?view=trains&vip=${String(vipOf(snapshot, 'EmpireMaker2').entry_key)}&train=23a5671f0c78`,
    )
    expect(notice).toHaveTextContent('best #511')
  })
})
