import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { contestOf, load, location, rail, renderLive, setPlayers, setVips } from './liveHarness'
import { BIG, LINEUP, SMALL, TRAINS, setLineupPool, setTrains, stat, trainHeading } from './liveTrainTestKit'

describe('rail', () => {
  it('lists the largest trains with size, closeness, best rank and PMR', async () => {
    const snapshot = load()
    setTrains(snapshot, [SMALL, { ...BIG, min_shared_slots: 8 }])
    await renderLive(snapshot, '/live/nfl')

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
    await renderLive(snapshot, '/live/nfl')

    const row = within(rail()).getByRole('link', { name: /×19/ })
    expect(row).toHaveTextContent('share 6 of 8')
    expect(row).not.toHaveTextContent('identical')
  })

  it('shows only the size when the producer sends no min_shared_slots', async () => {
    const snapshot = load()
    setTrains(snapshot, [BIG])
    await renderLive(snapshot, '/live/nfl')

    const row = within(rail()).getByRole('link', { name: /×19/ })
    expect(row).toHaveTextContent('best #16')
    expect(row).not.toHaveTextContent(/identical|share \d/i)
  })

  it('lists only the largest trains, six at most', async () => {
    const snapshot = load()
    setTrains(
      snapshot,
      Array.from({ length: 8 }, (_, index) => ({
        ...BIG,
        cluster_id: `t${index}`,
        user_count: 10 + index,
        rank: index + 1,
      })),
    )
    await renderLive(snapshot, '/live/nfl')

    const rows = within(rail()).getAllByRole('link', { name: /×\d+/ })
    expect(rows.map((row) => row.textContent?.match(/×\d+/)?.[0])).toEqual(['×17', '×16', '×15', '×14', '×13', '×12'])
  })

  it('opens a train from its rail row and keeps it in the URL', async () => {
    const snapshot = load()
    setTrains(snapshot, [BIG, SMALL])
    await renderLive(snapshot, '/live/nfl')

    fireEvent.click(within(rail()).getByRole('link', { name: /×3/ }))

    expect(location()).toBe('/live/nfl?view=trains&train=small')
    expect(trainHeading()).toHaveTextContent('×3')
    expect(within(rail()).getByRole('link', { name: /×3/ })).toHaveAttribute('aria-current', 'page')
    expect(within(rail()).getByRole('link', { name: /×19/ })).not.toHaveAttribute('aria-current')
  })

  it('still offers the Trains view, saying there are none, when the contest has no trains', async () => {
    const snapshot = load()
    setTrains(snapshot, [])
    await renderLive(snapshot, '/live/nfl')

    fireEvent.click(within(rail()).getByRole('link', { name: /^trains/i }))

    expect(location()).toBe('/live/nfl?view=trains')
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
    await renderLive(snapshot, '/live/nfl?view=trains&train=small')

    expect(trainHeading()).toHaveTextContent('×3')
  })

  it('falls back to the largest train for an unknown id', async () => {
    const snapshot = load()
    setTrains(snapshot, [BIG, SMALL])
    await renderLive(snapshot, '/live/nfl?view=trains&train=nope')

    expect(trainHeading()).toHaveTextContent('×19')
  })

  it('shows a train named in the URL that is outside the largest six, active in the rail', async () => {
    const snapshot = load()
    setTrains(
      snapshot,
      Array.from({ length: 8 }, (_, index) => ({
        ...BIG,
        cluster_id: `t${index}`,
        user_count: 10 + index,
        rank: index + 1,
      })),
    )
    await renderLive(snapshot, '/live/nfl?view=trains&train=t0')

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
    expect(stat('Best rank').getByText('of 1136')).toBeInTheDocument()
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
      {
        key: 'v1',
        name: 'First VIP',
        players: ['Live Guy', 'Later Guy', 'Finished Guy', 'Fourth Guy', 'Fifth Guy', 'Other'],
      },
      { key: 'v2', name: 'Second VIP', players: ['Live Guy', 'Nobody'] },
    ])
    await renderLive(snapshot, TRAINS)

    const overlaps = screen.getByRole('list', { name: /vips sharing this train/i })
    expect(within(overlaps).getByText(/First VIP/)).toBeInTheDocument()
    expect(
      within(overlaps)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([expect.stringContaining('shares 5/8'), expect.stringContaining('shares 1/8')])
  })

  it('omits the overlap row when there are no VIPs', async () => {
    const snapshot = load()
    setTrains(snapshot, [BIG])
    contestOf(snapshot).vip_lineups = []
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
