import { act, cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import ShiftsEntry from '../components/shifts/ShiftsEntry'
import { ShiftsContext } from '../context/ShiftsContext'
import type { CashLineShiftItem, ShiftItem, ShiftsFeed } from '../lib/shifts'

afterEach(cleanup)

function item(id: string, priority: ShiftItem['priority']): CashLineShiftItem {
  return {
    id,
    kind: 'cash-line',
    priority,
    detectedAt: 0,
    snapshotAt: '2026-10-04T18:00:00Z',
    parts: ['cash-line'],
    points: { from: 100, to: 103 },
    rank: { from: 40, to: 44 },
  }
}

/** A feed that only answers what the entry point reads; `set` replaces the unseen items and notifies. */
function stubFeed(initial: ShiftItem[]) {
  let items = initial
  const listeners = new Set<() => void>()
  const feed = {
    feed: () => items,
    unseenCount: () => items.length,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
  } as unknown as ShiftsFeed
  const set = (next: ShiftItem[]) => {
    items = next
    listeners.forEach((listener) => listener())
  }
  return { feed, set }
}

function renderEntry(feed: ShiftsFeed | null, sport: string | null = 'nfl') {
  return render(
    <MemoryRouter>
      <ShiftsContext.Provider value={feed}>
        <ShiftsEntry sport={sport} />
      </ShiftsContext.Provider>
    </MemoryRouter>,
  )
}

describe('Shifts entry point', () => {
  it('links to the sport’s Shifts page and labels the unseen count', () => {
    renderEntry(stubFeed([item('a', 'normal'), item('b', 'normal')]).feed)
    const link = screen.getByRole('link', { name: 'Shifts, 2 unseen' })
    expect(link.getAttribute('href')).toBe('/shifts/nfl')
    expect(screen.getByTestId('shifts-badge').textContent).toBe('2')
    expect(screen.getByTestId('shifts-badge').dataset.tone).toBe('grey')
  })

  it('turns the badge red when any unseen item is High priority', () => {
    renderEntry(stubFeed([item('a', 'normal'), item('b', 'high')]).feed)
    expect(screen.getByRole('link', { name: 'Shifts, 2 unseen' })).toBeTruthy()
    expect(screen.getByTestId('shifts-badge').dataset.tone).toBe('red')
  })

  it('shows no badge when nothing is unseen', () => {
    renderEntry(stubFeed([]).feed)
    expect(screen.getByRole('link', { name: 'Shifts, 0 unseen' }).getAttribute('href')).toBe('/shifts/nfl')
    expect(screen.queryByTestId('shifts-badge')).toBeNull()
  })

  it('follows the count as the feed changes, without a remount', () => {
    const { feed, set } = stubFeed([])
    renderEntry(feed)
    act(() => set([item('a', 'normal')]))
    expect(screen.getByRole('link', { name: 'Shifts, 1 unseen' })).toBeTruthy()
    expect(screen.getByTestId('shifts-badge').dataset.tone).toBe('grey')
    act(() => set([item('a', 'normal'), item('b', 'high')]))
    expect(screen.getByRole('link', { name: 'Shifts, 2 unseen' })).toBeTruthy()
    expect(screen.getByTestId('shifts-badge').dataset.tone).toBe('red')
    act(() => set([]))
    expect(screen.queryByTestId('shifts-badge')).toBeNull()
  })

  it('renders nothing without a feed or without a sport', () => {
    const { container, unmount } = renderEntry(null)
    expect(container.textContent).toBe('')
    unmount()
    expect(renderEntry(stubFeed([item('a', 'high')]).feed, null).container.textContent).toBe('')
  })
})
