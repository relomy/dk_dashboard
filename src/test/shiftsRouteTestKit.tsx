import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, expect, vi } from 'vitest'
import { ProfileContext } from '../context/ProfileContext'
import { ShiftsContext } from '../context/ShiftsContext'
import type { ShiftItem, ShiftsFeed, VipShiftItem } from '../lib/shifts'
import Shifts, { ShiftsSummary } from '../routes/Shifts'
import { load } from './liveHarness'

// Sample feed outputs over the NFL fixture's VIPs (provenance in public/mock/PRODUCER_FIXTURE.md).
export const VIP = { empire: '5275499864', cubbies: '5280114900', tuck: '5280874445' }
export const NAME = { empire: 'EmpireMaker2', cubbies: 'Cubbiesftw23', tuck: 'tuck8989' }

export function vipItem(key: keyof typeof VIP, overrides: Partial<VipShiftItem> = {}): VipShiftItem {
  return {
    id: `vip-${key}`,
    kind: 'vip',
    priority: 'normal',
    detectedAt: 0,
    snapshotAt: '2026-10-04T18:00:00Z',
    parts: ['rank-points'],
    vipKey: VIP[key],
    rank: { from: 600, to: 580 },
    points: { from: 30, to: 34.5 },
    distanceToCashPoints: { from: -20, to: -15.5 },
    distanceToCashRank: { from: -300, to: -280 },
    ...overrides,
  }
}

/** A feed stub holding fixed items; `markSeen` empties it, as the real feed does, and notifies. */
export function stubFeed(initial: ShiftItem[], flags: { autoAdvanced?: boolean } = {}) {
  let items = initial
  const listeners = new Set<() => void>()
  const feed = {
    record: vi.fn(),
    feed: () => items,
    unseenCount: () => items.length,
    unsurfaced: () => items.filter((item) => item.priority === 'high' && !item.surfaced),
    awaySummary: () => null,
    autoAdvanced: () => flags.autoAdvanced ?? false,
    seenSnapshotAt: () => null,
    markSeen: vi.fn(() => {
      items = []
      listeners.forEach((listener) => listener())
    }),
    markSurfaced: vi.fn(),
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
  } satisfies ShiftsFeed
  return feed
}

function stubApi(snapshotStatus = 200) {
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
      if (snapshotStatus !== 200) {
        return new Response(JSON.stringify({ error: { code: 'boom', message: 'Snapshot failed to load' } }), {
          status: snapshotStatus,
        })
      }
      return new Response(JSON.stringify(load()), { status: 200 })
    }),
  )
}

export async function renderShifts(
  feed: ShiftsFeed | null,
  username?: string,
  snapshotStatus = 200,
  path = '/shifts/nfl',
) {
  stubApi(snapshotStatus)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const profile = { id: 'me', name: 'Me', rules: username ? { username } : {} }
  render(
    <QueryClientProvider client={client}>
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
            <Routes>
              <Route path="/shifts/:sport" element={<Shifts />}>
                <Route index element={<ShiftsSummary />} />
              </Route>
            </Routes>
          </ShiftsContext.Provider>
        </ProfileContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  if (snapshotStatus === 200 && feed) {
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: /shifts/i }) ?? screen.queryByText(/nothing to follow/i),
      ).toBeTruthy(),
    )
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  cleanup()
})
