import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { load, location, rail, renderLive, setPlayers, setVips, stubPhone } from './liveHarness'

// The Live Command center: Players view, rail, phone tab bar and URL state.
// The producer fixture has no VIP lineups; tests that need them inject minimal ones.

function playersTable() {
  return screen.getByRole('table', { name: /players/i })
}

function playerRow(name: string) {
  return within(playersTable()).getByRole('row', { name: new RegExp(name) })
}

/** Player names in table order. The player cell reads "<team chip><name>"; these tests use FSU and MIZZ. */
function playerNames() {
  return within(playersTable())
    .getAllByRole('row')
    .slice(1)
    .map((row) => (within(row).getAllByRole('cell')[1].textContent ?? '').replace(/^(FSU|MIZZ)/, ''))
}

describe('Players view', () => {
  it('opens on the Players view', async () => {
    await renderLive(load())

    expect(screen.getByRole('heading', { name: /^players$/i })).toBeInTheDocument()
    expect(within(rail()).getByRole('link', { name: /^players/i })).toHaveAttribute('aria-current', 'page')
    expect(playerRow('Aiden Flora')).toBeInTheDocument()
  })

  it('shows position, team, name, game status, salary, ownership, points and value for each player', async () => {
    await renderLive(load())

    const row = within(playerRow('Aiden Flora'))
    expect(row.getByRole('cell', { name: 'RB' })).toBeInTheDocument()
    expect(row.getByText('ISU')).toBeInTheDocument()
    expect(row.getByText('Final')).toBeInTheDocument()
    expect(row.getByRole('cell', { name: '$6,300' })).toBeInTheDocument()
    expect(row.getByRole('cell', { name: '83.41%' })).toBeInTheDocument()
    expect(row.getByRole('cell', { name: '52.12' })).toBeInTheDocument()
    expect(row.getByRole('cell', { name: '8.3' })).toBeInTheDocument()
    expect(within(playerRow('Ousmane Kromah')).getByText('In progress')).toBeInTheDocument()
  })

  it('hides value for pre-game players', async () => {
    const snapshot = load()
    setPlayers(snapshot, [
      { name: 'Later Guy', game_status: 'FSU@MIZZ 07:30PM ET', value: 0, fantasy_points: 0 },
      { name: 'Playing Guy', value: 4.5 },
    ])
    await renderLive(snapshot)

    const later = within(playerRow('Later Guy'))
    expect(later.getByText('Pre-game')).toBeInTheDocument()
    expect(later.queryByText('0')).not.toBeInTheDocument()
    expect(within(playerRow('Playing Guy')).getByText('4.5')).toBeInTheDocument()
  })

  it('sorts by ownership by default and by points, value, salary and name on request', async () => {
    const snapshot = load()
    setPlayers(snapshot, [
      { name: 'Bravo', ownership_pct: 30, fantasy_points: 5, value: 1, salary: 9000 },
      { name: 'Alpha', ownership_pct: 10, fantasy_points: 40, value: 3, salary: 4000 },
      { name: 'Charlie', ownership_pct: 20, fantasy_points: 20, value: 6, salary: 6000 },
    ])
    await renderLive(snapshot)

    expect(playerNames()).toEqual(['Bravo', 'Charlie', 'Alpha'])

    fireEvent.click(within(playersTable()).getByRole('button', { name: 'Pts' }))
    expect(playerNames()).toEqual(['Alpha', 'Charlie', 'Bravo'])

    fireEvent.click(within(playersTable()).getByRole('button', { name: 'Pts' }))
    expect(playerNames()).toEqual(['Bravo', 'Charlie', 'Alpha'])

    fireEvent.click(within(playersTable()).getByRole('button', { name: 'Value' }))
    expect(playerNames()).toEqual(['Charlie', 'Alpha', 'Bravo'])

    fireEvent.click(within(playersTable()).getByRole('button', { name: 'Salary' }))
    expect(playerNames()).toEqual(['Bravo', 'Charlie', 'Alpha'])

    fireEvent.click(within(playersTable()).getByRole('button', { name: 'Player' }))
    expect(playerNames()).toEqual(['Alpha', 'Bravo', 'Charlie'])

    fireEvent.click(within(playersTable()).getByRole('button', { name: 'Own' }))
    expect(playerNames()).toEqual(['Bravo', 'Charlie', 'Alpha'])
  })

  it('filters to players still to play', async () => {
    const snapshot = load()
    setPlayers(snapshot, [
      { name: 'Done Guy', game_status: 'Final' },
      { name: 'Playing Guy', game_status: 'In-Progress' },
      { name: 'Later Guy', game_status: 'FSU@MIZZ 07:30PM ET' },
    ])
    await renderLive(snapshot)

    fireEvent.click(screen.getByRole('button', { name: 'Still to play' }))
    expect(screen.getByRole('button', { name: 'Still to play' })).toHaveAttribute('aria-pressed', 'true')
    expect(playerNames()).toEqual(['Playing Guy', 'Later Guy'])

    fireEvent.click(screen.getByRole('button', { name: 'All' }))
    expect(playerNames()).toHaveLength(3)
  })

  it('filters to players on a VIP', async () => {
    const snapshot = load()
    setPlayers(snapshot, [{ name: 'Rostered Guy' }, { name: 'Free Guy' }])
    setVips(snapshot, [{ key: 'vip-a', name: 'First VIP', players: ['Rostered Guy'] }])
    await renderLive(snapshot)

    fireEvent.click(screen.getByRole('button', { name: 'On a VIP' }))
    expect(playerNames()).toEqual(['Rostered Guy'])
  })

  it('searches by player name or team', async () => {
    const snapshot = load()
    setPlayers(snapshot, [
      { name: 'Florida Guy', team: 'FSU' },
      { name: 'Missouri Guy', team: 'MIZZ' },
    ])
    await renderLive(snapshot)

    const search = screen.getByRole('searchbox', { name: /search player or team/i })
    fireEvent.change(search, { target: { value: 'mizz' } })
    expect(playerNames()).toEqual(['Missouri Guy'])

    fireEvent.change(search, { target: { value: 'florida' } })
    expect(playerNames()).toEqual(['Florida Guy'])

    fireEvent.change(search, { target: { value: 'nobody' } })
    expect(screen.getByText(/no players match/i)).toBeInTheDocument()
  })

  it('shows the avatars of the VIPs who roster each player', async () => {
    const snapshot = load()
    setPlayers(snapshot, [{ name: 'Shared Guy' }, { name: 'Solo Guy' }, { name: 'Free Guy' }])
    setVips(snapshot, [
      { key: 'vip-a', name: 'First VIP', players: ['Shared Guy', 'Solo Guy'] },
      { key: 'vip-b', name: 'Second VIP', players: ['Shared Guy'] },
    ])
    await renderLive(snapshot)

    const shared = within(playerRow('Shared Guy'))
    expect(shared.getByRole('link', { name: 'First VIP' })).toBeInTheDocument()
    expect(shared.getByRole('link', { name: 'Second VIP' })).toBeInTheDocument()
    expect(within(playerRow('Solo Guy')).getAllByRole('link')).toHaveLength(1)
    expect(within(playerRow('Free Guy')).queryByRole('link')).not.toBeInTheDocument()
  })

  it('opens a VIP from their avatar', async () => {
    const snapshot = load()
    setPlayers(snapshot, [{ name: 'Rostered Guy' }])
    setVips(snapshot, [{ key: 'vip-a', name: 'First VIP', players: ['Rostered Guy'] }])
    await renderLive(snapshot)

    fireEvent.click(within(playerRow('Rostered Guy')).getByRole('link', { name: 'First VIP' }))

    expect(location()).toBe('/live/cfb?view=vips&vip=vip-a')
    expect(screen.getByRole('heading', { name: 'First VIP' })).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: /players/i })).not.toBeInTheDocument()
  })
})

describe('Total ownership', () => {
  it('splits the pool ownership into Final, In play and Pre-game shares with the raw total', async () => {
    const snapshot = load()
    setPlayers(snapshot, [
      { name: 'Done Guy', ownership_pct: 100, game_status: 'Final' },
      { name: 'Playing Guy', ownership_pct: 60, game_status: 'In-Progress' },
      { name: 'Later Guy', ownership_pct: 40, game_status: 'FSU@MIZZ 07:30PM ET' },
    ])
    await renderLive(snapshot)

    const bar = screen.getByRole('region', { name: /total ownership/i })
    expect(within(bar).getByText('200%')).toBeInTheDocument()
    expect(within(bar).getByText('Final').parentElement).toHaveTextContent('Final 50%')
    expect(within(bar).getByText('In play').parentElement).toHaveTextContent('In play 30%')
    expect(within(bar).getByText('Pre-game').parentElement).toHaveTextContent('Pre-game 20%')
    expect(bar).toHaveAttribute('title', 'Total ownership 200% — Final 100% · In play 60% · Pre-game 40%')
    expect(bar).not.toHaveTextContent(/locked/i)
  })

  it('says game status is unavailable when the sport has none', async () => {
    await renderLive(load(), '/live/golf')

    const bar = screen.getByRole('region', { name: /total ownership/i })
    expect(within(bar).getByText(/game status isn't available for this sport/i)).toBeInTheDocument()
  })
})

describe('views and URL state', () => {
  it('switches views from the rail and keeps the view in the URL', async () => {
    await renderLive(load())

    const [largest] = within(rail()).getAllByRole('link', { name: /×\d+/ })
    fireEvent.click(largest)
    expect(location()).toBe('/live/cfb?view=trains&train=720149ac5192')
    expect(within(rail()).getByRole('link', { name: /×17/ })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('heading', { name: /^×17/ })).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: /players/i })).not.toBeInTheDocument()

    fireEvent.click(within(rail()).getByRole('link', { name: /^vips/i }))
    expect(location()).toBe('/live/cfb?view=vips&train=720149ac5192')
    expect(screen.getByText(/no vips are tracked in this contest/i)).toBeInTheDocument()

    fireEvent.click(within(rail()).getByRole('link', { name: /^players/i }))
    expect(location()).toBe('/live/cfb?train=720149ac5192')
    expect(playersTable()).toBeInTheDocument()
  })

  it('opens the view named in a shared link', async () => {
    await renderLive(load(), '/live/cfb?view=trains')

    expect(screen.getByRole('heading', { name: /^×17/ })).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: /players/i })).not.toBeInTheDocument()
  })

  it('falls back to Players for an unknown view', async () => {
    await renderLive(load(), '/live/cfb?view=nonsense')

    expect(playersTable()).toBeInTheDocument()
  })

  it('keeps the Leverage panel beside the main area on wide screens', async () => {
    await renderLive(load())

    const aside = within(screen.getByRole('complementary', { name: /leverage/i }))
    expect(aside.getByRole('heading', { name: /swing players/i })).toBeInTheDocument()
    expect(aside.getByRole('heading', { name: /ownership leaders/i })).toBeInTheDocument()
  })
})

describe('top bar', () => {
  it('shows the cash line and snapshot time', async () => {
    await renderLive(load())

    const bar = within(screen.getByRole('banner'))
    expect(bar.getByText('129.04')).toBeInTheDocument()
    expect(bar.getByText(/cash/i)).toBeInTheDocument()
    expect(bar.getByRole('time')).toHaveAttribute('datetime', '2026-10-03T20:48:31Z')
  })
})

describe('phones', () => {
  function tabBar() {
    return screen.getByRole('navigation', { name: /live tabs/i })
  }

  it('replaces the rail with a Players · VIPs · Trains · Leverage tab bar', async () => {
    stubPhone()
    await renderLive(load())

    expect(screen.queryByRole('navigation', { name: /live views/i })).not.toBeInTheDocument()
    expect(within(tabBar()).getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Players',
      'VIPs',
      'Trains',
      'Leverage',
    ])
    expect(screen.queryByRole('heading', { name: /swing players/i })).not.toBeInTheDocument()

    fireEvent.click(within(tabBar()).getByRole('link', { name: 'Leverage' }))
    expect(location()).toBe('/live/cfb?view=leverage')
    expect(screen.getByRole('heading', { name: /swing players/i })).toBeInTheDocument()

    fireEvent.click(within(tabBar()).getByRole('link', { name: 'VIPs' }))
    expect(screen.getByText(/no vips are tracked in this contest/i)).toBeInTheDocument()
  })

  it('condenses rows and expands one on tap to show salary, game and the VIPs who roster the player', async () => {
    stubPhone()
    const snapshot = load()
    setPlayers(snapshot, [{ name: 'Rostered Guy', salary: 6100, ownership_pct: 33.3, fantasy_points: 12.5, value: 2.05 }])
    setVips(snapshot, [{ key: 'vip-a', name: 'First VIP', players: ['Rostered Guy'] }])
    await renderLive(snapshot)

    const row = screen.getByRole('button', { name: /rostered guy/i })
    expect(row).toHaveAttribute('aria-expanded', 'false')
    expect(row).toHaveTextContent('33.3%')
    expect(row).toHaveTextContent('12.50')
    expect(row).toHaveTextContent('2.1')
    expect(screen.queryByText('$6,100')).not.toBeInTheDocument()

    fireEvent.click(row)
    expect(row).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('$6,100')).toBeInTheDocument()
    expect(screen.getByText('vs. MIZZ')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('link', { name: 'First VIP' }))
    expect(location()).toBe('/live/cfb?view=vips&vip=vip-a')
  })
})
