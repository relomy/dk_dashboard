import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ShiftsBanner from '../components/shifts/ShiftsBanner'
import { ProfileContext } from '../context/ProfileContext'
import { ShiftsContext } from '../context/ShiftsContext'
import type { ContestShiftItem, ShiftItem, ShiftsFeed, ShiftsGap, VipShiftItem } from '../lib/shifts'
import { load } from './liveHarness'

// Sample feed outputs over the NFL fixture's VIPs (provenance in public/mock/PRODUCER_FIXTURE.md).
const VIP = { empire: '5275499864', cubbies: '5280114900', tuck: '5280874445' }

function crossingItem(key: keyof typeof VIP, overrides: Partial<VipShiftItem> = {}): VipShiftItem {
  return {
    id: `vip-${key}`,
    kind: 'vip',
    priority: 'high',
    detectedAt: 0,
    vipKey: VIP[key],
    rank: { from: 600, to: 580 },
    points: { from: 30, to: 34.5 },
    distanceToCashPoints: { from: -0.3, to: 2.2 },
    distanceToCashRank: { from: 4, to: -2 },
    crossing: { path: 'in', cause: null },
    ...overrides,
  }
}

function completedItem(): ContestShiftItem {
  return {
    id: 'contest-1',
    kind: 'contest-state',
    priority: 'high',
    detectedAt: 0,
    state: { from: 'live', to: 'completed' },
  }
}

/** A feed stub holding fixed items. `markSurfaced` flags the items and notifies, as the real feed does. */
function stubFeed(initial: ShiftItem[], gap: ShiftsGap | null = null) {
  let items = initial
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach((listener) => listener())
  const feed = {
    record: vi.fn(),
    feed: () => items,
    unseenCount: () => items.length,
    unsurfaced: () => items.filter((item) => item.priority === 'high' && !item.surfaced),
    gap: () => gap,
    autoAdvanced: () => false,
    seenSnapshotAt: () => null,
    markSeen: vi.fn(),
    markSurfaced: vi.fn((ids: string[]) => {
      items = items.map((item) => (ids.includes(item.id) ? { ...item, surfaced: true } : item))
      notify()
    }),
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
  } satisfies ShiftsFeed
  return {
    feed,
    /** Replaces the feed's items, as a poll would. */
    set(next: ShiftItem[]) {
      items = next
      notify()
    },
  }
}

function stubApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/latest')) {
        return new Response(
          JSON.stringify({
            latest_snapshot_path: 'snapshots/live.json',
            snapshot_at: '2026-10-04T18:41:34Z',
            generated_at: '2026-10-04T18:41:34Z',
            available_sports: ['nfl'],
            manifest_today_path: 'manifest/2026-10-04.json',
          }),
          { status: 200 },
        )
      }
      return new Response(JSON.stringify(load()), { status: 200 })
    }),
  )
}

function tree(feed: ShiftsFeed, sport: string, username?: string) {
  const profile = { id: 'me', name: 'Me', rules: username ? { username } : {} }
  return (
    <ProfileContext.Provider
      value={{
        profiles: [profile],
        activeProfileId: profile.id,
        activeProfile: profile,
        setActiveProfileId: () => {},
        addProfile: () => {},
        updateProfile: () => {},
        deleteProfile: () => {},
      }}
    >
      <ShiftsContext.Provider value={feed}>
        <ShiftsBanner sport={sport} />
      </ShiftsContext.Provider>
    </ProfileContext.Provider>
  )
}

async function renderBanner(feed: ShiftsFeed, username?: string) {
  stubApi()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = (props: { sport: string; username?: string }) => (
    <QueryClientProvider client={client}>
      <MemoryRouter>{tree(feed, props.sport, props.username)}</MemoryRouter>
    </QueryClientProvider>
  )
  const result = render(view({ sport: 'nfl', username }))
  // The banner words rows with VIP names from the snapshot; let the fetch and the model build settle.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30))
  })
  return { ...result, rerenderWith: (props: { sport: string; username?: string }) => result.rerender(view(props)) }
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('the Shifts banner rows', () => {
  it('shows nothing when no High item is unsurfaced', async () => {
    const { feed } = stubFeed([crossingItem('empire', { priority: 'normal', crossing: undefined }), crossingItem('cubbies', { surfaced: true })])
    await renderBanner(feed)
    expect(screen.queryByRole('region', { name: 'Shifts banner' })).toBeNull()
  })

  it('shows one row per unsurfaced High item with a High tag, View and Dismiss', async () => {
    const { feed } = stubFeed([
      crossingItem('empire'),
      completedItem(),
      crossingItem('cubbies', { surfaced: true }),
      crossingItem('tuck', { priority: 'normal', crossing: undefined }),
    ])
    await renderBanner(feed)
    const rows = await screen.findAllByRole('listitem')
    expect(rows).toHaveLength(2)
    const [vip, contest] = rows
    expect(within(vip).getByText('High')).toBeTruthy()
    expect(vip.textContent).toContain('EmpireMaker2 moved into cashing')
    expect(within(vip).getByRole('link', { name: 'View' }).getAttribute('href')).toBe('/shifts/nfl')
    expect(within(vip).getByRole('button', { name: 'Dismiss' })).toBeTruthy()
    expect(contest.textContent).toContain('The contest is complete')
  })

  it('words each crossing path', async () => {
    const { feed } = stubFeed([
      crossingItem('empire', { crossing: { path: 'out', cause: null } }),
      crossingItem('cubbies', { crossing: { path: 'in then out', cause: null } }),
      crossingItem('tuck', { crossing: { path: 'out then in', cause: null } }),
    ])
    await renderBanner(feed)
    const rows = await screen.findAllByRole('listitem')
    expect(rows[0].textContent).toContain('EmpireMaker2 fell out of cashing')
    expect(rows[1].textContent).toContain('Cubbiesftw23 crossed into cashing and back out')
    expect(rows[2].textContent).toContain('tuck8989 fell out of cashing and back in')
  })

  it('says so when a cash line move caused the crossing', async () => {
    const cause = { points: { from: 31.24, to: 33.5 }, rank: { from: 500, to: 505 } }
    const { feed } = stubFeed([crossingItem('empire', { crossing: { path: 'out', cause } })])
    await renderBanner(feed)
    const [row] = await screen.findAllByRole('listitem')
    expect(row.textContent).toContain('EmpireMaker2 fell out of cashing because the cash line moved +2.26 pts and down 5 places')
  })

  it('says "You" only for the VIP the active Profile\'s username rule matches', async () => {
    const { feed } = stubFeed([crossingItem('empire'), crossingItem('cubbies')])
    await renderBanner(feed, 'empiremaker2')
    const rows = await screen.findAllByRole('listitem')
    expect(rows[0].textContent).toContain('You moved into cashing')
    expect(rows[1].textContent).toContain('Cubbiesftw23 moved into cashing')
  })

  it('uses names for everyone when the Profile has no username rule', async () => {
    const { feed } = stubFeed([crossingItem('empire')])
    await renderBanner(feed)
    const [row] = await screen.findAllByRole('listitem')
    expect(row.textContent).toContain('EmpireMaker2 moved into cashing')
    expect(row.textContent).not.toContain('You')
  })
})

describe('dismissing and surfacing', () => {
  it('removes only the dismissed row and marks that item surfaced', async () => {
    const { feed } = stubFeed([crossingItem('empire'), crossingItem('cubbies')])
    await renderBanner(feed)
    const [first] = await screen.findAllByRole('listitem')
    fireEvent.click(within(first).getByRole('button', { name: 'Dismiss' }))
    expect(feed.markSurfaced).toHaveBeenCalledTimes(1)
    expect(feed.markSurfaced).toHaveBeenCalledWith(['vip-empire'])
    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(1)
    expect(rows[0].textContent).toContain('Cubbiesftw23')
  })

  it('does not mark anything surfaced just by showing the rows', async () => {
    const { feed } = stubFeed([crossingItem('empire')])
    await renderBanner(feed)
    await screen.findAllByRole('listitem')
    expect(feed.markSurfaced).not.toHaveBeenCalled()
  })

  it('keeps a row on screen when its item is surfaced elsewhere, and does not blank the others', async () => {
    const { feed } = stubFeed([crossingItem('empire'), crossingItem('cubbies')])
    await renderBanner(feed)
    await screen.findAllByRole('listitem')
    act(() => feed.markSurfaced(['vip-empire']))
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('adds the rows a later poll brings without disturbing the ones already shown', async () => {
    const stub = stubFeed([crossingItem('empire')])
    await renderBanner(stub.feed)
    await screen.findAllByRole('listitem')
    act(() => stub.set([crossingItem('empire'), crossingItem('cubbies')]))
    const rows = screen.getAllByRole('listitem')
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('EmpireMaker2'),
      expect.stringContaining('Cubbiesftw23'),
    ])
  })

  it('drops rows once the feed is marked seen', async () => {
    const stub = stubFeed([crossingItem('empire')])
    await renderBanner(stub.feed)
    await screen.findAllByRole('listitem')
    act(() => stub.set([]))
    expect(screen.queryByRole('region', { name: 'Shifts banner' })).toBeNull()
  })

  it('starts over for another sport', async () => {
    const stub = stubFeed([crossingItem('empire')])
    const view = await renderBanner(stub.feed)
    await screen.findAllByRole('listitem')
    act(() => stub.set([crossingItem('cubbies')]))
    view.rerenderWith({ sport: 'golf' })
    const rows = screen.queryAllByRole('listitem')
    expect(rows.every((row) => !row.textContent?.includes('EmpireMaker2'))).toBe(true)
  })
})

describe('the "while you were away" line', () => {
  const gap = (overrides: Partial<ShiftsGap> = {}): ShiftsGap => ({
    unseenCount: 3,
    topItem: crossingItem('empire'),
    minutesAway: 45,
    ...overrides,
  })

  it('shows no summary without a gap', async () => {
    const { feed } = stubFeed([crossingItem('empire')])
    await renderBanner(feed)
    await screen.findAllByRole('listitem')
    expect(screen.queryByText(/away/i)).toBeNull()
  })

  it('shows one summary row with the time away, the unseen count and the top item', async () => {
    const { feed } = stubFeed([], gap())
    await renderBanner(feed)
    const summary = await screen.findByText(/away/i)
    const row = summary.closest('li') as HTMLElement
    expect(row.textContent).toContain('45 minutes')
    expect(row.textContent).toContain('3 unseen')
    expect(row.textContent).toContain('EmpireMaker2 moved into cashing')
    expect(within(row).getByRole('link', { name: 'Open' }).getAttribute('href')).toBe('/shifts/nfl')
    expect(within(row).getByRole('button', { name: 'Dismiss' })).toBeTruthy()
  })

  it('words a long absence in hours and a single unseen item in the singular', async () => {
    const { feed } = stubFeed([], gap({ minutesAway: 125, unseenCount: 1, topItem: completedItem() }))
    await renderBanner(feed)
    const row = (await screen.findByText(/away/i)).closest('li') as HTMLElement
    expect(row.textContent).toContain('2 hours 5 minutes')
    expect(row.textContent).toContain('1 unseen')
    expect(row.textContent).toContain('The contest is complete')
  })

  it('names the top item as "You" for the Profile\'s own VIP', async () => {
    const { feed } = stubFeed([], gap())
    await renderBanner(feed, 'EmpireMaker2')
    const row = (await screen.findByText(/away/i)).closest('li') as HTMLElement
    expect(row.textContent).toContain('You moved into cashing')
  })

  it('dismisses only the summary and leaves the High rows alone', async () => {
    const { feed } = stubFeed([crossingItem('empire')], gap())
    await renderBanner(feed)
    const row = (await screen.findByText(/away/i)).closest('li') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText(/away/i)).toBeNull()
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(feed.markSurfaced).not.toHaveBeenCalled()
  })
})
