import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { CashLineMove, CashLineShiftItem, ContestShiftItem } from '../lib/shifts'
import { NAME, renderShifts, stubFeed, vipItem } from './shiftsRouteTestKit'

describe('the Shifts page', () => {
  it('renders one card per VIP item, in the feed order, named', async () => {
    await renderShifts(stubFeed([vipItem('cubbies'), vipItem('empire'), vipItem('tuck')]))
    const cards = await screen.findAllByRole('article')
    expect(cards.map((card) => within(card).getByRole('heading').textContent)).toEqual([
      NAME.cubbies,
      NAME.empire,
      NAME.tuck,
    ])
  })

  it('shows a crossing with its path, marks the card High and names a cash line cause', async () => {
    const crossing = vipItem('empire', {
      priority: 'high',
      crossing: {
        path: 'out',
        cause: { points: { from: 400.5, to: 405.25 }, rank: { from: 500, to: 520 } },
      },
    })
    await renderShifts(
      stubFeed([crossing, vipItem('tuck', { crossing: { path: 'in then out', cause: null }, priority: 'high' })]),
    )
    const [caused, plain] = await screen.findAllByRole('article')
    expect(within(caused).getByText('High')).toBeTruthy()
    expect(within(caused).getByText(/fell out of cashing/i)).toBeTruthy()
    expect(within(caused).getByText(/the cash line moved \+4\.75 pts/i)).toBeTruthy()
    expect(within(caused).getByText(/their lineup did not cause this/i)).toBeTruthy()
    expect(within(plain).getByText(/crossed into cashing and back out/i)).toBeTruthy()
    expect(within(plain).queryByText(/their lineup did not cause this/i)).toBeNull()
  })

  it('shows rank, points and distance to cash as from → to with an arrow for the better or worse direction', async () => {
    await renderShifts(
      stubFeed([
        vipItem('empire', {
          rank: { from: 600, to: 580 },
          points: { from: 30, to: 34.5 },
          distanceToCashPoints: { from: -20, to: -15.5 },
        }),
        vipItem('tuck', {
          rank: { from: 580, to: 600 },
          points: { from: 34.5, to: 30 },
          distanceToCashPoints: { from: -15.5, to: -20 },
        }),
      ]),
    )
    const [better, worse] = await screen.findAllByRole('article')
    const rank = (card: HTMLElement) => within(card).getByRole('group', { name: 'Rank' })
    expect(rank(better).textContent).toContain('#600 → #580')
    expect(rank(better).textContent).toContain('20 places')
    expect(within(rank(better)).getByRole('img', { name: 'Improved' })).toBeTruthy()
    expect(within(rank(worse)).getByRole('img', { name: 'Worsened' })).toBeTruthy()
    const points = within(better).getByRole('group', { name: 'Points' })
    expect(points.textContent).toContain('30.00 → 34.50')
    expect(within(points).getByRole('img', { name: 'Improved' })).toBeTruthy()
    expect(
      within(within(worse).getByRole('group', { name: 'Points' })).getByRole('img', { name: 'Worsened' }),
    ).toBeTruthy()
    const toCash = within(better).getByRole('group', { name: 'To cash' })
    expect(toCash.textContent).toContain('−20 → −15.5')
    expect(within(toCash).getByRole('img', { name: 'Improved' })).toBeTruthy()
    expect(
      within(within(worse).getByRole('group', { name: 'To cash' })).getByRole('img', { name: 'Worsened' }),
    ).toBeTruthy()
  })

  it('shows no arrow for a zero or unknown move', async () => {
    await renderShifts(
      stubFeed([
        vipItem('empire', {
          rank: { from: 600, to: 600 },
          points: { from: 30, to: 31 },
          distanceToCashPoints: { from: null, to: null },
        }),
      ]),
    )
    const card = (await screen.findAllByRole('article'))[0]
    expect(within(within(card).getByRole('group', { name: 'Rank' })).queryByRole('img')).toBeNull()
    expect(within(within(card).getByRole('group', { name: 'To cash' })).queryByRole('img')).toBeNull()
    expect(
      within(within(card).getByRole('group', { name: 'Points' })).getByRole('img', { name: 'Improved' }),
    ).toBeTruthy()
  })

  it('shows a cash line move as a neutral card, with no good or bad reading', async () => {
    const line: CashLineShiftItem = {
      id: 'cash-line',
      kind: 'cash-line',
      priority: 'normal',
      detectedAt: 0,
      snapshotAt: '2026-10-04T18:00:00Z',
      parts: ['cash-line'],
      points: { from: 400.5, to: 405.25 },
      rank: { from: 500, to: 520 },
    }
    await renderShifts(stubFeed([line]))
    const card = (await screen.findAllByRole('article'))[0]
    expect(within(card).getByRole('heading', { name: 'Cash line' })).toBeTruthy()
    expect(within(card).getByRole('group', { name: 'Points' }).textContent).toContain('400.50 → 405.25')
    expect(within(card).getByRole('group', { name: 'Rank' }).textContent).toContain('#500 → #520')
    expect(within(card).queryByRole('img', { name: /improved|worsened/i })).toBeNull()
    expect(card.innerHTML).not.toMatch(/text-(non-)?cashing/)
  })

  it('says the final standings are in on a contest state change', async () => {
    const state: ContestShiftItem = {
      id: 'contest-state',
      kind: 'contest-state',
      priority: 'high',
      detectedAt: 0,
      snapshotAt: '2026-10-04T18:00:00Z',
      parts: ['contest-state'],
      state: { from: 'live', to: 'completed' },
    }
    await renderShifts(stubFeed([state]))
    const card = (await screen.findAllByRole('article'))[0]
    expect(within(card).getByText('High')).toBeTruthy()
    expect(within(card).getByText(/final standings are in/i)).toBeTruthy()
  })

  it('shows final standings only on a VIP card after the contest completes', async () => {
    await renderShifts(
      stubFeed([
        vipItem('empire', {
          finishedCashing: true,
          distanceToCashPoints: { from: null, to: null },
          distanceToCashRank: { from: null, to: null },
        }),
        vipItem('tuck', {
          finishedCashing: false,
          distanceToCashPoints: { from: null, to: null },
          distanceToCashRank: { from: null, to: null },
        }),
      ]),
    )
    const [cashed, missed] = await screen.findAllByRole('article')
    expect(within(cashed).getByText(/finished cashing/i)).toBeTruthy()
    expect(within(missed).getByText(/finished outside the cash line/i)).toBeTruthy()
    expect(within(cashed).getByRole('group', { name: 'Rank' })).toBeTruthy()
    expect(within(cashed).getByRole('group', { name: 'Points' })).toBeTruthy()
    expect(within(cashed).queryByRole('group', { name: 'To cash' })).toBeNull()
  })

  it("hides the name only on the card of the VIP the active Profile's username rule matches", async () => {
    await renderShifts(stubFeed([vipItem('empire'), vipItem('tuck')]), 'empiremaker2')
    const [you, other] = await screen.findAllByRole('article')
    expect(within(you).getByRole('heading').textContent).toBe('You')
    expect(within(you).queryByText(NAME.empire)).toBeNull()
    expect(within(other).getByRole('heading').textContent).toBe(NAME.tuck)
  })

  it('shows names when the Profile has no username rule, or one that matches nobody', async () => {
    await renderShifts(stubFeed([vipItem('empire')]), 'somebody-else')
    expect((await screen.findAllByRole('heading', { level: 2 }))[0].textContent).toBe(NAME.empire)
    cleanup()
    await renderShifts(stubFeed([vipItem('empire')]))
    expect((await screen.findAllByRole('heading', { level: 2 }))[0].textContent).toBe(NAME.empire)
  })

  it('marks the feed as seen and then shows the nothing-moved empty state', async () => {
    const feed = stubFeed([vipItem('empire')])
    await renderShifts(feed)
    fireEvent.click(await screen.findByRole('button', { name: 'Mark as seen' }))
    expect(feed.markSeen).toHaveBeenCalledTimes(1)
    expect(await screen.findByText(/nothing has moved since you last looked/i)).toBeTruthy()
    expect(screen.queryAllByRole('article')).toHaveLength(0)
    expect((screen.getByRole('button', { name: 'Mark as seen' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('disables Mark as seen when nothing is unseen, without the auto-advance note', async () => {
    await renderShifts(stubFeed([]))
    expect((await screen.findByRole('button', { name: 'Mark as seen' })) as HTMLButtonElement).toHaveProperty(
      'disabled',
      true,
    )
    expect(screen.getByText(/nothing has moved since you last looked/i)).toBeTruthy()
    expect(screen.queryByText(/moved on by itself/i)).toBeNull()
  })

  it('notes that the Seen mark moved on by itself after a quick visit', async () => {
    await renderShifts(stubFeed([], { autoAdvanced: true }))
    expect(await screen.findByText(/^moved on by itself because you were only away briefly/i)).toBeTruthy()
  })

  it('shows the load error instead of loading forever when the snapshot fails', async () => {
    await renderShifts(stubFeed([]), undefined, 500)
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByText(/loading shifts/i)).toBeNull()
  })

  it('words a crossing cause that moved neither points nor places without an empty sentence', async () => {
    const still: CashLineMove = { points: { from: 400, to: 400 }, rank: { from: 500, to: 500 } }
    await renderShifts(stubFeed([vipItem('empire', { priority: 'high', crossing: { path: 'in', cause: still } })]))
    const card = (await screen.findAllByRole('article'))[0]
    expect(within(card).queryByText(/the cash line moved \./i)).toBeNull()
  })

  it('points the arrow up for an improvement, so a rank that falls to a better place shows an up arrow', async () => {
    await renderShifts(
      stubFeed([
        vipItem('empire', { rank: { from: 600, to: 580 } }),
        vipItem('tuck', { rank: { from: 580, to: 600 } }),
      ]),
    )
    const [better, worse] = await screen.findAllByRole('article')
    const arrow = (card: HTMLElement) => within(within(card).getByRole('group', { name: 'Rank' })).getByRole('img')
    expect(arrow(better).getAttribute('data-direction')).toBe('up')
    expect(arrow(worse).getAttribute('data-direction')).toBe('down')
  })

  it('points a neutral cash line arrow by the way the figure moved', async () => {
    const line: CashLineShiftItem = {
      id: 'cl',
      kind: 'cash-line',
      priority: 'normal',
      detectedAt: 0,
      snapshotAt: '2026-10-04T18:00:00Z',
      parts: ['cash-line'],
      points: { from: 400, to: 405 },
      rank: { from: 520, to: 500 },
    }
    await renderShifts(stubFeed([line]))
    const card = (await screen.findAllByRole('article'))[0]
    expect(
      within(within(card).getByRole('group', { name: 'Points' }))
        .getByRole('img')
        .getAttribute('data-direction'),
    ).toBe('up')
    expect(
      within(within(card).getByRole('group', { name: 'Rank' }))
        .getByRole('img')
        .getAttribute('data-direction'),
    ).toBe('down')
  })
})
