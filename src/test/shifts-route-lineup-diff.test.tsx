import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { LineupSlotDiff } from '../lib/shifts'
import { renderShifts, stubFeed, vipItem } from './shiftsRouteTestKit'

/** One slot of a sample lineup diff, as the feed emits it: an unchanged live player unless overridden. */
function slot(key: string, name: string, overrides: Partial<LineupSlotDiff> = {}): LineupSlotDiff {
  return {
    key,
    slot: 'FLEX',
    name,
    playerKey: `p-${key}`,
    points: { from: 10, to: 10 },
    pointsMove: 0,
    locked: { from: false, to: false },
    gameStatus: { from: 'in-progress', to: 'in-progress' },
    ...overrides,
  }
}

/** A player whose points rose by `gain` since the Seen mark. */
function scorer(key: string, name: string, gain: number, overrides: Partial<LineupSlotDiff> = {}): LineupSlotDiff {
  return slot(key, name, { points: { from: 10, to: 10 + gain }, pointsMove: gain, ...overrides })
}

describe('the lineup diff on a VIP card', () => {
  it('shows a collapsed Lineup row counting the changed players, which toggles the diff open and closed', async () => {
    const lineup = [scorer('s1', 'Josh Allen', 4.5), slot('s2', 'Travis Kelce'), slot('s3', 'Tyreek Hill')]
    await renderShifts(stubFeed([vipItem('empire', { lineup })]))
    const toggle = await screen.findByRole('button', { name: /lineup · 1 of 3 changed/i })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('Josh Allen')).toBeNull()
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('Josh Allen')).toBeTruthy()
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('Josh Allen')).toBeNull()
  })

  it('lists every slot in the order the feed gives them, showing both statuses for a game that changed and one otherwise', async () => {
    const lineup = [
      scorer('s1', 'Josh Allen', 4.5, { gameStatus: { from: 'in-progress', to: 'final' } }),
      slot('s2', 'Travis Kelce'),
      slot('s3', 'Tyreek Hill', { gameStatus: { from: 'pre-game', to: 'pre-game' } }),
    ]
    await renderShifts(stubFeed([vipItem('empire', { lineup })]))
    fireEvent.click(await screen.findByRole('button', { name: /lineup/i }))
    const rows = screen.getAllByRole('listitem')
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('Josh Allen'),
      expect.stringContaining('Travis Kelce'),
      expect.stringContaining('Tyreek Hill'),
    ])
    expect(within(rows[0]).getByText('Live → Final')).toBeTruthy()
    expect(within(rows[1]).getByText('Live')).toBeTruthy()
    expect(within(rows[2]).getByText('Pre')).toBeTruthy()
    expect(within(rows[1]).queryByText(/(Pre|Live|Final) →/)).toBeNull()
  })

  it('tags a reveal "Revealed" and shows its points as — → points', async () => {
    const lineup = [
      slot('s1', 'Dalton Kincaid', {
        points: { from: null, to: 12.4 },
        pointsMove: 12.4,
        locked: { from: true, to: false },
        gameStatus: { from: null, to: 'in-progress' },
      }),
      scorer('s2', 'Josh Allen', 4.5),
    ]
    await renderShifts(stubFeed([vipItem('empire', { lineup })]))
    fireEvent.click(await screen.findByRole('button', { name: /lineup · 2 of 2 changed/i }))
    const [revealed, other] = screen.getAllByRole('listitem')
    expect(within(revealed).getByText('Revealed')).toBeTruthy()
    expect(within(revealed).getByText('— → 12.40')).toBeTruthy()
    expect(within(revealed).getByText('Live')).toBeTruthy()
    expect(within(other).queryByText('Revealed')).toBeNull()
    expect(within(other).getByText('10.00 → 14.50')).toBeTruthy()
  })

  it('shows a still-hidden slot with a lock and "Still hidden", and no points, status or name', async () => {
    const lineup = [
      scorer('s1', 'Josh Allen', 4.5),
      slot('s2', 'Locked', {
        playerKey: null,
        points: { from: null, to: null },
        pointsMove: null,
        locked: { from: true, to: true },
        gameStatus: { from: null, to: null },
      }),
    ]
    await renderShifts(stubFeed([vipItem('empire', { lineup })]))
    fireEvent.click(await screen.findByRole('button', { name: /lineup · 1 of 2 changed/i }))
    const hidden = screen.getAllByRole('listitem')[1]
    expect(within(hidden).getByRole('img', { name: 'Still locked' })).toBeTruthy()
    expect(within(hidden).getByText('Still hidden')).toBeTruthy()
    expect(within(hidden).queryByText('Locked')).toBeNull()
    expect(within(hidden).queryByText(/\d/)).toBeNull()
    expect(within(hidden).queryByText('Revealed')).toBeNull()
  })

  it('colours each delta by the way the player moved, and dims unchanged players with a delta of 0.00', async () => {
    const lineup = [
      scorer('s1', 'Josh Allen', 4.5),
      slot('s2', 'Travis Kelce', { points: { from: 10, to: 7 }, pointsMove: -3 }),
      slot('s3', 'Tyreek Hill'),
      // A late swap: not compared, so no delta and not counted as changed.
      slot('s4', 'Dalton Kincaid', {
        points: { from: null, to: 8 },
        pointsMove: null,
        gameStatus: { from: null, to: 'in-progress' },
      }),
    ]
    await renderShifts(stubFeed([vipItem('empire', { lineup })]))
    fireEvent.click(await screen.findByRole('button', { name: /lineup · 2 of 4 changed/i }))
    const [up, down, same, swapped] = screen.getAllByRole('listitem')
    expect(within(up).getByText('+4.5').className).toMatch(/text-cashing/)
    expect(within(down).getByText('−3').className).toMatch(/text-non-cashing/)
    const zero = within(same).getByText('0.00')
    expect(zero.className).not.toMatch(/text-(non-)?cashing/)
    expect(within(swapped).getByText('—')).toBeTruthy()
    expect(up.className).not.toMatch(/opacity-50/)
    expect(down.className).not.toMatch(/opacity-50/)
    expect(same.className).toMatch(/opacity-50/)
    expect(swapped.className).toMatch(/opacity-50/)
  })

  it('shows the stats line under the name only when the data has one, and does not count a stats-only change', async () => {
    const lineup = [
      scorer('s1', 'Josh Allen', 4.5, { stats: { from: null, to: '245 YDS, 2 TD' } }),
      slot('s2', 'Travis Kelce'),
      slot('s3', 'Tyreek Hill', { stats: { from: '1 TD', to: '2 TD' } }),
    ]
    await renderShifts(stubFeed([vipItem('empire', { lineup })]))
    fireEvent.click(await screen.findByRole('button', { name: /lineup · 1 of 3 changed/i }))
    const [withStats, without, statsOnly] = screen.getAllByRole('listitem')
    expect(within(withStats).getByText('245 YDS, 2 TD')).toBeTruthy()
    expect(within(without).queryByText(/YDS|TD/)).toBeNull()
    expect(within(statsOnly).getByText('2 TD')).toBeTruthy()
  })

  it('shows no lineup row on a final-standing card, or on a card with no lineup to compare', async () => {
    await renderShifts(
      stubFeed([
        vipItem('empire', {
          finishedCashing: true,
          distanceToCashPoints: { from: null, to: null },
          distanceToCashRank: { from: null, to: null },
        }),
        vipItem('tuck', { lineup: [] }),
      ]),
    )
    const cards = await screen.findAllByRole('article')
    expect(cards).toHaveLength(2)
    expect(screen.queryByRole('button', { name: /lineup/i })).toBeNull()
  })
})

describe('the Shifts tab shell', () => {
  it('shows Summary selected, with Timeline beside it, and a panel that holds the Summary', async () => {
    await renderShifts(stubFeed([vipItem('empire')]))
    const tabs = within(screen.getByRole('tablist')).getAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Summary', 'Timeline'])
    expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toEqual(['true', 'false'])
    const panel = screen.getByRole('tabpanel')
    expect(panel.getAttribute('aria-labelledby')).toBe(tabs[0].id)
    expect(within(panel).getByRole('button', { name: 'Mark as seen' })).toBeTruthy()
    expect(within(panel).getAllByRole('article')).toHaveLength(1)
  })

  it('keeps the tab focusable by keyboard and shows a visible focus ring on it', async () => {
    await renderShifts(stubFeed([]))
    const tab = await screen.findByRole('tab', { name: 'Summary' })
    tab.focus()
    expect(document.activeElement).toBe(tab)
    expect(tab.className).toContain('focus-visible:ring')
  })

  it('shows the not-renderable message without a tab strip for a sport with nothing to follow', async () => {
    await renderShifts(stubFeed([]), undefined, 200, '/shifts/mlb')
    expect(await screen.findByText('There is nothing to follow live for this sport.')).toBeTruthy()
    expect(screen.queryByRole('tablist')).toBeNull()
  })
})
