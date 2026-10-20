/* eslint-disable react-refresh/only-export-components -- a test helper, never hot-reloaded */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, vi } from 'vitest'
import { ProfileContext } from '../context/ProfileContext'
import { ShiftsContext } from '../context/ShiftsContext'
import { TimelineSourceContext } from '../context/TimelineSourceContext'
import type { ShiftsFeed } from '../lib/shifts'
import { createTimelineSource, type TimelineSource } from '../lib/timelineSource'
import Shifts, { ShiftsSummary, ShiftsTimeline } from '../routes/Shifts'
import { load } from './liveHarness'
import { stamp, stubHistory } from './timelineHistory'

const NO_ITEMS: never[] = []
export const clockAt = (slot: number) =>
  new Date(stamp(slot)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })

function stubFeed(): ShiftsFeed {
  return {
    record: vi.fn(),
    feed: () => NO_ITEMS,
    unseenCount: () => 0,
    unsurfaced: () => [],
    awaySummary: () => null,
    autoAdvanced: () => false,
    seenSnapshotAt: () => null,
    markSeen: vi.fn(),
    markSurfaced: vi.fn(),
    subscribe: () => () => {},
  }
}

/** A feed whose Seen mark the test moves, notifying subscribers as the real feed does. */
export function seenFeed(seenAt: string | null) {
  let seen = seenAt
  const listeners = new Set<() => void>()
  const feed: ShiftsFeed = {
    ...stubFeed(),
    seenSnapshotAt: () => seen,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
  }
  return {
    feed,
    move(next: string | null) {
      seen = next
      listeners.forEach((listener) => listener())
    },
  }
}

/** The rail's order top to bottom: each Step's snapshot time, or 'seen-mark' for the divider. */
export function railOrder(): string[] {
  const list = screen.getByRole('list', { name: 'Timeline' })
  return [...list.querySelectorAll('hr, time')].map((node) =>
    node.tagName === 'HR' ? 'seen-mark' : (node.getAttribute('datetime') ?? ''),
  )
}

function stubApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/api/latest')) {
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

export const realSource = (history = stubHistory().history) =>
  createTimelineSource({ history, now: () => 1, yieldToMain: async () => {} })

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>
}

export function renderAt(
  path: string,
  options: { feed?: ShiftsFeed | null; source?: TimelineSource; rules?: Record<string, string> } = {},
) {
  stubApi()
  const feed = options.feed === undefined ? stubFeed() : options.feed
  const profile = { id: 'me', name: 'Me', rules: options.rules ?? { exact: 'Cubbiesftw23' } }
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
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
            <TimelineSourceContext.Provider value={options.source ?? realSource()}>
              <Routes>
                <Route path="/shifts/:sport" element={<Shifts />}>
                  <Route index element={<ShiftsSummary />} />
                  <Route path="timeline" element={<ShiftsTimeline />} />
                </Route>
              </Routes>
              <Where />
            </TimelineSourceContext.Provider>
          </ShiftsContext.Provider>
        </ProfileContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/** Registered in each test file that imports this kit. */
afterEach(() => {
  vi.unstubAllGlobals()
  cleanup()
})
