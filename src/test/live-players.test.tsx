import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { load, location, rail, renderLive, setPlayers, stubPhone, vipOf } from './liveHarness'

// The Live Command center: Players view, rail, phone tab bar and URL state.
// Driven by the captured NFL slate: 45 pooled players, all in progress, six VIPs, trains led by a ×312.
// The sort, status and share tests need controlled values or statuses the captured pool lacks (every
// player is in progress), so they replace the pool with `setPlayers` rows and say so.

function playersTable() {
  return screen.getByRole('table', { name: /players/i })
}

function playerRow(name: string) {
  return within(playersTable()).getByRole('row', { name: new RegExp(name) })
}

/** Player names in table order. The player cell reads "<team chip><name>"; the hand-built pools use FSU and MIZZ. */
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
    expect(playerRow('Trevor Lawrence')).toBeInTheDocument()
  })

  it('shows position, team, name, game status, salary, ownership, points and value for each player', async () => {
    await renderLive(load())

    const row = within(playerRow('Trevor Lawrence'))
    expect(row.getByRole('cell', { name: 'QB' })).toBeInTheDocument()
    expect(row.getByText('JAX')).toBeInTheDocument()
    expect(row.getByText('In progress')).toBeInTheDocument()
    expect(row.getByRole('cell', { name: '$5,900' })).toBeInTheDocument()
    expect(row.getByRole('cell', { name: '70.86%' })).toBeInTheDocument()
    expect(row.getByRole('cell', { name: '9.44' })).toBeInTheDocument()
    expect(row.getByRole('cell', { name: '1.6' })).toBeInTheDocument()
  })

  it('lists every pooled player, most owned first', async () => {
    await renderLive(load())

    const rows = within(playersTable()).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(45)
    expect(within(rows[0]).getByText('Parker Washington')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Trevor Lawrence')).toBeInTheDocument()
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
    // Nine pooled players are on a VIP's lineup; Josh Allen is a swing player no VIP rosters.
    await renderLive(load())

    fireEvent.click(screen.getByRole('button', { name: 'On a VIP' }))

    const rows = within(playersTable()).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(9)
    expect(within(playersTable()).queryByText('Josh Allen')).not.toBeInTheDocument()
    for (const name of ['Trevor Lawrence', 'Chase Brown', 'Jeremiyah Love', 'Garrett Wilson', 'Parker Washington', 'Rams', 'Tyler Higbee']) {
      expect(within(playersTable()).getByText(name)).toBeInTheDocument()
    }
  })

  it('searches by player name or team', async () => {
    await renderLive(load())

    const search = screen.getByRole('searchbox', { name: /search player or team/i })
    fireEvent.change(search, { target: { value: 'cin' } })
    expect(within(playersTable()).getAllByRole('row').slice(1)).toHaveLength(5)
    for (const name of ['Chase Brown', 'Ja\'Marr Chase', 'Joe Burrow', 'Mike Gesicki', 'Tee Higgins']) {
      expect(within(playersTable()).getByText(name)).toBeInTheDocument()
    }

    fireEvent.change(search, { target: { value: 'lawrence' } })
    expect(within(playersTable()).getAllByRole('row').slice(1)).toHaveLength(1)
    expect(within(playersTable()).getByText('Trevor Lawrence')).toBeInTheDocument()

    fireEvent.change(search, { target: { value: 'nobody' } })
    expect(screen.getByText(/no players match/i)).toBeInTheDocument()
  })

  it('shows the avatars of the VIPs who roster each player', async () => {
    await renderLive(load())

    // All six VIPs roster Lawrence; four roster Washington; none rosters Josh Allen.
    const lawrence = within(playerRow('Trevor Lawrence'))
    for (const name of ['cglenn91', 'Cubbiesftw23', 'tuck8989', 'EmpireMaker2', 'Aj_cray', 'Mcoleman1902']) {
      expect(lawrence.getByRole('link', { name })).toBeInTheDocument()
    }
    expect(within(playerRow('Parker Washington')).getAllByRole('link')).toHaveLength(4)
    expect(within(playerRow('Josh Allen')).queryByRole('link')).not.toBeInTheDocument()
  })

  it('opens a VIP from their avatar', async () => {
    const snapshot = load()
    await renderLive(snapshot)

    fireEvent.click(within(playerRow('Parker Washington')).getByRole('link', { name: 'EmpireMaker2' }))

    expect(location()).toBe(`/live/nfl?view=vips&vip=${String(vipOf(snapshot, 'EmpireMaker2').entry_key)}`)
    expect(screen.getByRole('heading', { name: 'EmpireMaker2' })).toBeInTheDocument()
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
    const shares = within(bar).getByRole('list', { name: /game status shares/i })
    expect(within(shares).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Final 50%',
      'In play 30%',
      'Pre-game 20%',
    ])
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
  const LARGEST = '23a5671f0c78'

  it('switches views from the rail and keeps the view in the URL', async () => {
    const snapshot = load()
    await renderLive(snapshot)

    const [largest] = within(rail()).getAllByRole('link', { name: /×\d+/ })
    fireEvent.click(largest)
    expect(location()).toBe(`/live/nfl?view=trains&train=${LARGEST}`)
    expect(within(rail()).getByRole('link', { name: /×312/ })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('heading', { name: /^×312/ })).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: /players/i })).not.toBeInTheDocument()

    fireEvent.click(within(rail()).getByRole('link', { name: /cglenn91/ }))
    expect(location()).toBe(`/live/nfl?view=vips&train=${LARGEST}&vip=${String(vipOf(snapshot, 'cglenn91').entry_key)}`)
    expect(screen.getByRole('heading', { name: 'cglenn91' })).toBeInTheDocument()

    fireEvent.click(within(rail()).getByRole('link', { name: /^players/i }))
    expect(location()).toBe(`/live/nfl?train=${LARGEST}&vip=${String(vipOf(snapshot, 'cglenn91').entry_key)}`)
    expect(playersTable()).toBeInTheDocument()
  })

  it('lands a reload or shared link on the same view and focus the app put in the URL', async () => {
    const snapshot = load()
    await renderLive(snapshot)

    fireEvent.click(within(rail()).getByRole('link', { name: /Cubbiesftw23/ }))
    const [, secondLargest] = within(rail()).getAllByRole('link', { name: /×\d+/ })
    const trainName = secondLargest.textContent?.match(/×\d+/)?.[0] ?? ''
    expect(trainName).toBe('×76')
    fireEvent.click(secondLargest)
    const shared = location() ?? ''
    expect(shared).toMatch(/view=trains/)
    expect(shared).toContain(`vip=${String(vipOf(snapshot, 'Cubbiesftw23').entry_key)}`)
    expect(shared).toMatch(/train=/)

    cleanup()
    await renderLive(snapshot, shared)

    expect(location()).toBe(shared)
    expect(screen.getByRole('heading', { name: new RegExp(`^${trainName}`) })).toBeInTheDocument()
    expect(within(rail()).getByRole('link', { name: new RegExp(trainName) })).toHaveAttribute('aria-current', 'page')
    const swing = within(screen.getByRole('region', { name: 'Swing players' }))
    expect(swing.getByText(/unfinished, most owned/i)).toHaveTextContent(`vs ${trainName} train`)

    // The VIP picked before the Train is still the one in focus once the Train is left.
    fireEvent.click(within(rail()).getByRole('link', { name: /^players/i }))
    expect(swing.getByText(/unfinished, most owned/i)).toHaveTextContent('vs Cubbiesftw23')
  })

  it('opens the view named in a shared link', async () => {
    await renderLive(load(), '/live/nfl?view=trains')

    expect(screen.getByRole('heading', { name: /^×312/ })).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: /players/i })).not.toBeInTheDocument()
  })

  it('falls back to Players for an unknown view', async () => {
    await renderLive(load(), '/live/nfl?view=nonsense')

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
    expect(bar.getByText('31.24')).toBeInTheDocument()
    expect(bar.getByText(/cash/i)).toBeInTheDocument()
    expect(bar.getByRole('time')).toHaveAttribute('datetime', '2026-10-04T18:41:34Z')
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
    expect(location()).toBe('/live/nfl?view=leverage')
    expect(screen.getByRole('heading', { name: /swing players/i })).toBeInTheDocument()

    fireEvent.click(within(tabBar()).getByRole('link', { name: 'VIPs' }))
    expect(screen.getByRole('heading', { name: 'cglenn91' })).toBeInTheDocument()
  })

  it('condenses rows and expands one on tap to show salary, game and the VIPs who roster the player', async () => {
    stubPhone()
    const snapshot = load()
    await renderLive(snapshot)

    const row = screen.getByRole('button', { name: /trevor lawrence/i })
    expect(row).toHaveAttribute('aria-expanded', 'false')
    expect(row).toHaveTextContent('70.86%')
    expect(row).toHaveTextContent('9.44')
    expect(row).toHaveTextContent('1.6')
    expect(screen.queryByText('$5,900')).not.toBeInTheDocument()

    fireEvent.click(row)
    expect(row).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('$5,900')).toBeInTheDocument()
    expect(screen.getByText('at CIN')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('link', { name: 'EmpireMaker2' }))
    expect(location()).toBe(`/live/nfl?view=vips&vip=${String(vipOf(snapshot, 'EmpireMaker2').entry_key)}`)
  })
})
