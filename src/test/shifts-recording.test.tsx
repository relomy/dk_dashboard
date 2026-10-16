import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AppShell from '../components/AppShell'
import { AuthProvider } from '../context/AuthProvider'
import { ProfileProvider } from '../context/ProfileProvider'
import { useShiftsFeed } from '../hooks/useShiftsFeed'
import Live from '../routes/Live'
import { load } from './liveHarness'

// The recorder traces what the shell hands the Shifts feed, so the real feed is wrapped to log every call, and
// the Live model builder is wrapped to count builds.
const calls = vi.hoisted(() => ({
  records: [] as Array<{ sport: string; snapshotAt: string | null; visit: boolean }>,
  builds: [] as string[],
}))

vi.mock('../lib/shifts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/shifts')>()
  return {
    ...actual,
    createShiftsFeed: (options?: Parameters<typeof actual.createShiftsFeed>[0]) => {
      const feed = actual.createShiftsFeed(options)
      return {
        ...feed,
        record: (model: Parameters<typeof feed.record>[0], opts: Parameters<typeof feed.record>[1]) => {
          calls.records.push({ sport: model.sport, snapshotAt: model.snapshotAt, visit: opts.visit })
          feed.record(model, opts)
        },
      }
    },
  }
})

vi.mock('../lib/liveModel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/liveModel')>()
  return {
    ...actual,
    buildLiveModel: (snapshot: unknown, sportKey: string) => {
      calls.builds.push(sportKey)
      return actual.buildLiveModel(snapshot, sportKey)
    },
  }
})

const store = new Map<string, string>()
let pointer: string
let served: Record<string, unknown>
let role: 'owner' | 'friend'

function stubApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/auth/me')) {
        return new Response(
          JSON.stringify({ user: { id: 'u1', username: 'dana', role, must_change_password: false } }),
          { status: 200 },
        )
      }
      if (url.includes('/api/auth/csrf')) {
        return new Response(JSON.stringify({ csrf_token: 'csrf_1' }), { status: 200 })
      }
      if (url.includes('/api/latest')) {
        return new Response(
          JSON.stringify({
            latest_snapshot_path: pointer,
            snapshot_at: '2026-10-04T18:41:34Z',
            generated_at: '2026-10-04T18:41:34Z',
            available_sports: ['golf', 'nfl'],
            manifest_today_path: 'manifest/2026-10-04.json',
          }),
          { status: 200 },
        )
      }
      const path = decodeURIComponent(new URL(url, 'http://x').searchParams.get('path') ?? '')
      return new Response(JSON.stringify(served[path]), { status: 200 })
    }),
  )
}

/** A later snapshot of the same slate: a new `snapshot_at`, so a new Live model build. */
function laterSnapshot(snapshotAt: string) {
  const snapshot = load()
  snapshot.snapshot_at = snapshotAt
  return snapshot
}

function FeedProbe() {
  const shifts = useShiftsFeed()
  return <output data-testid="feed-probe">{shifts ? `feed:${shifts.unseenCount()}` : 'no-feed'}</output>
}

function renderShell(path: string, element = <Live />) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <ProfileProvider>
            <Routes>
              <Route element={<AppShell />}>
                <Route path="/live/:sport" element={element} />
                <Route path="/sport/:sport" element={<FeedProbe />} />
                <Route path="/shifts/:sport" element={<FeedProbe />} />
                <Route path="/settings" element={<FeedProbe />} />
              </Route>
            </Routes>
          </ProfileProvider>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return client
}

async function recorded(count: number) {
  await vi.waitFor(() => expect(calls.records).toHaveLength(count))
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  calls.records.length = 0
  calls.builds.length = 0
  store.clear()
  role = 'owner'
  pointer = 'snapshots/first.json'
  served = { 'snapshots/first.json': load() }
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  })
  stubApi()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(document, 'visibilityState')
})

describe('recording Live builds in the shell', () => {
  it('records the viewed sport once on page open as a visit, building the model once', async () => {
    renderShell('/live/nfl')
    await screen.findByRole('heading', { name: /live: nfl/i })
    await recorded(1)

    expect(calls.records).toEqual([{ sport: 'nfl', snapshotAt: '2026-10-04T18:41:34Z', visit: true }])
    expect(calls.builds).toEqual(['nfl'])
  })

  it('records a later poll as a build that is not a visit', async () => {
    const client = renderShell('/live/nfl')
    await recorded(1)

    served['snapshots/second.json'] = laterSnapshot('2026-10-04T18:46:34Z')
    pointer = 'snapshots/second.json'
    await act(async () => {
      await client.refetchQueries({ queryKey: ['latest'] })
    })
    await recorded(2)

    expect(calls.records[1]).toEqual({ sport: 'nfl', snapshotAt: '2026-10-04T18:46:34Z', visit: false })
    expect(calls.builds).toEqual(['nfl', 'nfl'])
  })

  it('records on a page without a sport for the last-viewed sport', async () => {
    store.set('dk_dashboard_last_sport', 'nfl')
    renderShell('/settings')
    await recorded(1)

    expect(calls.records[0]).toMatchObject({ sport: 'nfl', visit: true })
  })

  it('records nothing on a page without a sport when no sport was viewed yet', async () => {
    renderShell('/settings')
    await screen.findByTestId('feed-probe')
    await vi.waitFor(() =>
      expect(vi.mocked(globalThis.fetch).mock.calls.some(([input]) => String(input).includes('/api/snapshot'))).toBe(true),
    )

    expect(calls.records).toEqual([])
  })

  it('records nothing for a sport whose primary contest cannot be built', async () => {
    renderShell('/live/cfb')
    await screen.findByText(/no cfb data/i)

    expect(calls.records).toEqual([])
  })

  it('records the sport page too, without a second build of the same model', async () => {
    renderShell('/sport/nfl')
    await recorded(1)

    expect(calls.records[0]).toMatchObject({ sport: 'nfl', visit: true })
    expect(calls.builds).toEqual(['nfl'])
  })
})

describe('recording on the Shifts page', () => {
  it('records the sport the page shows, not the last-viewed one', async () => {
    store.set('dk_dashboard_last_sport', 'golf')
    renderShell('/shifts/nfl')
    await recorded(1)

    expect(calls.records[0]).toMatchObject({ sport: 'nfl', visit: true })
  })
})

describe('visits', () => {
  it('counts the tab returning to visible as a visit on the next build, not the hide', async () => {
    const client = renderShell('/live/nfl')
    await recorded(1)

    setVisibility('hidden')
    served['snapshots/second.json'] = laterSnapshot('2026-10-04T19:46:34Z')
    pointer = 'snapshots/second.json'
    await act(async () => {
      await client.refetchQueries({ queryKey: ['latest'] })
    })
    await recorded(2)
    expect(calls.records[1].visit).toBe(false)

    act(() => setVisibility('visible'))
    served['snapshots/third.json'] = laterSnapshot('2026-10-04T19:51:34Z')
    pointer = 'snapshots/third.json'
    await act(async () => {
      await client.refetchQueries({ queryKey: ['latest'] })
    })
    await recorded(3)

    expect(calls.records[2]).toEqual({ sport: 'nfl', snapshotAt: '2026-10-04T19:51:34Z', visit: true })
  })

  it('records the current model as the visit when nothing new arrives after the tab returns', async () => {
    renderShell('/live/nfl')
    await recorded(1)

    vi.useFakeTimers({ shouldAdvanceTime: true })
    act(() => setVisibility('visible'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })

    expect(calls.records).toHaveLength(2)
    expect(calls.records[1]).toMatchObject({ sport: 'nfl', snapshotAt: '2026-10-04T18:41:34Z', visit: true })
  })

  it('does not record twice when the page opens and the tab becomes visible in the same tick', async () => {
    renderShell('/live/nfl')
    act(() => setVisibility('visible'))
    await recorded(1)
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(calls.records).toHaveLength(1)
  })
})

describe('the Live view', () => {
  it('renders as before when the Shifts storage throws', async () => {
    // Only the Shifts keys are blocked: the Profile store is outside this change and does not guard its reads.
    const guard = (key: string) => {
      if (key.startsWith('dk_dashboard_shifts_')) throw new Error('blocked')
    }
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => (guard(key), store.get(key) ?? null),
      setItem: (key: string, value: string) => (guard(key), void store.set(key, value)),
      removeItem: (key: string) => (guard(key), void store.delete(key)),
    })
    renderShell('/live/nfl')
    await recorded(1)

    expect(await screen.findByRole('heading', { name: /live: nfl/i })).toBeInTheDocument()
  })

  it('renders as before when storage is missing', async () => {
    vi.stubGlobal('localStorage', undefined)
    renderShell('/live/nfl')

    expect(await screen.findByRole('heading', { name: /live: nfl/i })).toBeInTheDocument()
  })
})

describe('useShiftsFeed', () => {
  it('gives pages under the shell the feed', async () => {
    renderShell('/settings')

    await vi.waitFor(() => expect(screen.getByTestId('feed-probe')).toHaveTextContent('feed:0'))
  })
})

describe('the owner-only gate', () => {
  it('records nothing, builds nothing and writes no Shifts state for a friend', async () => {
    role = 'friend'
    renderShell('/settings')
    await screen.findByTestId('feed-probe')
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })
    expect(calls.records).toHaveLength(0)
    expect(calls.builds).toHaveLength(0)
    expect([...store.keys()].filter((key) => key.startsWith('dk_dashboard_shifts_'))).toEqual([])
  })

  it('gives a friend no feed', async () => {
    role = 'friend'
    renderShell('/sport/nfl')
    expect((await screen.findByTestId('feed-probe')).textContent).toBe('no-feed')
  })

  it('still renders the Live view for a friend', async () => {
    role = 'friend'
    renderShell('/live/nfl')
    await vi.waitFor(() => expect(calls.builds.length).toBeGreaterThan(0))
    expect(calls.records).toHaveLength(0)
  })
})
