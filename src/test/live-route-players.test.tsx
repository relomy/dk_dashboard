import { cleanup, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { load, playerRow, playersTable, renderLive, setPlayers, setVips, type Json } from './liveHarness'
import { setTrains } from './liveRouteTestKit'

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
