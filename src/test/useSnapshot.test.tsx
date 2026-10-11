import { focusManager, onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useLatestSnapshot, useSnapshotAt } from '../hooks/useSnapshot'

// The module's interface is the seam: a fake fetch stands in for the dashboard API.

afterEach(() => {
  vi.unstubAllGlobals()
  cleanup()
})

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

function snapshot(version: unknown, marker = 'a') {
  return {
    ...(version === undefined ? {} : { schema_version: version }),
    snapshot_at: '2026-10-03T20:48:31Z',
    generated_at: '2026-10-03T20:48:31Z',
    marker,
    sports: { nfl: { status: 'fresh', players: [], contests: [] } },
  }
}

interface Api {
  pointer: () => Response | Promise<Response>
  snapshots: Record<string, () => Response | Promise<Response>>
  requests: string[]
}

function fakeApi(api: Partial<Api> = {}) {
  const state: Api = {
    pointer: () => json({ latest_snapshot_path: 'snapshots/a.json' }),
    snapshots: { 'snapshots/a.json': () => json(snapshot(3)) },
    requests: [],
    ...api,
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost')
      state.requests.push(url.pathname === '/api/snapshot' ? url.searchParams.get('path')! : url.pathname)
      if (url.pathname === '/api/latest') return state.pointer()
      return state.snapshots[url.searchParams.get('path')!]()
    }),
  )
  return state
}

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return renderHook(() => useLatestSnapshot(), { wrapper })
}

describe('useLatestSnapshot', () => {
  it('is loading until the snapshot arrives, then ready with the snapshot', async () => {
    fakeApi()
    const { result } = mount()

    expect(result.current).toEqual({ kind: 'loading' })
    await waitFor(() => expect(result.current.kind).toBe('ready'))
    expect(result.current).toMatchObject({ kind: 'ready', snapshot: { schema_version: 3, marker: 'a' } })
  })

  it('names the Latest snapshot path once ready', async () => {
    fakeApi()
    const { result } = mount()

    await waitFor(() => expect(result.current.kind).toBe('ready'))
    expect(result.current).toMatchObject({ kind: 'ready', latestPath: 'snapshots/a.json' })
  })

  it('refreshes by re-reading the Latest pointer and loading the snapshot it now names', async () => {
    let pointerPath = 'snapshots/a.json'
    const api = fakeApi({
      pointer: () => json({ latest_snapshot_path: pointerPath }),
      snapshots: {
        'snapshots/a.json': () => json(snapshot(3, 'a')),
        'snapshots/b.json': () => json(snapshot(3, 'b')),
      },
    })
    const { result } = mount()
    await waitFor(() => expect(result.current.kind).toBe('ready'))

    pointerPath = 'snapshots/b.json'
    await act(async () => {
      if (result.current.kind === 'ready') await result.current.refresh()
    })

    expect(api.requests.filter((request) => request === '/api/latest')).toHaveLength(2)
    await waitFor(() =>
      expect(result.current).toMatchObject({ kind: 'ready', latestPath: 'snapshots/b.json', snapshot: { marker: 'b' } }),
    )
  })

  it('is an error when the Latest pointer cannot be fetched', async () => {
    fakeApi({ pointer: () => json({}, 500) })
    const { result } = mount()

    await waitFor(() => expect(result.current.kind).toBe('error'))
    expect(result.current).toMatchObject({ kind: 'error', error: { message: 'Request failed (500)' } })
  })

  it('is an error when the snapshot cannot be fetched', async () => {
    fakeApi({ snapshots: { 'snapshots/a.json': () => json({}, 404) } })
    const { result } = mount()

    await waitFor(() => expect(result.current.kind).toBe('error'))
    expect(result.current).toMatchObject({ kind: 'error', error: { message: 'Request failed (404)' } })
  })

  it('is unsupported, carrying the version, for a schema version other than 3', async () => {
    fakeApi({ snapshots: { 'snapshots/a.json': () => json(snapshot(2)) } })
    const { result } = mount()

    await waitFor(() => expect(result.current.kind).toBe('unsupported'))
    expect(result.current).toEqual({ kind: 'unsupported', version: '2' })
  })

  it('is unsupported with version "unknown" when the snapshot has no schema version', async () => {
    fakeApi({ snapshots: { 'snapshots/a.json': () => json(snapshot(undefined)) } })
    const { result } = mount()

    await waitFor(() => expect(result.current.kind).toBe('unsupported'))
    expect(result.current).toEqual({ kind: 'unsupported', version: 'unknown' })
  })

  it('stays ready with the previous snapshot while the next path downloads', async () => {
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    let pointerPath = 'snapshots/a.json'
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const api = fakeApi({
        pointer: () => json({ latest_snapshot_path: pointerPath }),
        snapshots: {
          'snapshots/a.json': () => json(snapshot(3, 'a')),
          'snapshots/b.json': async () => (await held, json(snapshot(3, 'b'))),
        },
      })
      const { result } = mount()
      await waitFor(() => expect(result.current).toMatchObject({ kind: 'ready', snapshot: { marker: 'a' } }))

      pointerPath = 'snapshots/b.json'
      await vi.advanceTimersByTimeAsync(300_000)
      await waitFor(() => expect(api.requests).toContain('snapshots/b.json'))
      expect(result.current).toMatchObject({ kind: 'ready', snapshot: { marker: 'a' } })

      release()
      await waitFor(() => expect(result.current).toMatchObject({ kind: 'ready', snapshot: { marker: 'b' } }))
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('useSnapshotAt', () => {
  function mountAt(path: string | undefined) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    return renderHook(() => useSnapshotAt(path, 'history'), { wrapper })
  }

  it('reads a chosen path without consulting the Latest pointer', async () => {
    const api = fakeApi({ snapshots: { 'snapshots/old.json': () => json(snapshot(3, 'old')) } })
    const { result } = mountAt('snapshots/old.json')

    expect(result.current.outcome).toEqual({ kind: 'loading' })
    await waitFor(() => expect(result.current.outcome.kind).toBe('ready'))
    expect(result.current.outcome).toMatchObject({ kind: 'ready', snapshot: { marker: 'old' } })
    expect(api.requests).toEqual(['snapshots/old.json'])
  })

  it('is unsupported, carrying the version, for a chosen path with another schema version', async () => {
    fakeApi({ snapshots: { 'snapshots/old.json': () => json(snapshot(2)) } })
    const { result } = mountAt('snapshots/old.json')

    await waitFor(() => expect(result.current.outcome.kind).toBe('unsupported'))
    expect(result.current.outcome).toEqual({ kind: 'unsupported', version: '2' })
  })

  it('is an error when the chosen snapshot cannot be fetched', async () => {
    fakeApi({ snapshots: { 'snapshots/old.json': () => json({}, 404) } })
    const { result } = mountAt('snapshots/old.json')

    await waitFor(() => expect(result.current.outcome.kind).toBe('error'))
    expect(result.current.outcome).toMatchObject({ error: { message: 'Request failed (404)' } })
  })

  it('does not fetch while no path is chosen', () => {
    const api = fakeApi()
    const { result } = mountAt(undefined)

    expect(result.current.outcome).toEqual({ kind: 'loading' })
    expect(api.requests).toEqual([])
  })

  it('does not hold the previous snapshot when the chosen path changes', async () => {
    fakeApi({
      snapshots: {
        'snapshots/a.json': () => json(snapshot(3, 'a')),
        'snapshots/b.json': () => new Promise<Response>(() => {}),
      },
    })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const { result, rerender } = renderHook(({ path }) => useSnapshotAt(path, 'history'), {
      wrapper,
      initialProps: { path: 'snapshots/a.json' },
    })
    await waitFor(() => expect(result.current.outcome.kind).toBe('ready'))

    rerender({ path: 'snapshots/b.json' })
    expect(result.current.outcome).toEqual({ kind: 'loading' })
  })

  it('refetches the chosen path on request', async () => {
    const api = fakeApi({ snapshots: { 'snapshots/old.json': () => json(snapshot(3, 'old')) } })
    const { result } = mountAt('snapshots/old.json')
    await waitFor(() => expect(result.current.outcome.kind).toBe('ready'))

    await result.current.refetch()
    expect(api.requests).toEqual(['snapshots/old.json', 'snapshots/old.json'])
  })

  it('shares one fetch between Latest and History retention of the same path', async () => {
    const api = fakeApi()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(
      () => ({
        latest: useSnapshotAt('snapshots/a.json', 'latest'),
        history: useSnapshotAt('snapshots/a.json', 'history'),
      }),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.latest.outcome.kind).toBe('ready')
      expect(result.current.history.outcome.kind).toBe('ready')
    })
    expect(api.requests).toEqual(['snapshots/a.json'])
  })

  describe('re-checking once stale', () => {
    afterEach(() => {
      vi.useRealTimers()
      focusManager.setFocused(undefined)
      onlineManager.setOnline(true)
    })

    const focusEvent = () => {
      focusManager.setFocused(false)
      focusManager.setFocused(true)
    }
    const reconnectEvent = () => {
      onlineManager.setOnline(false)
      onlineManager.setOnline(true)
    }

    async function mountAged(retention: 'latest' | 'history') {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      const api = fakeApi()
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      )
      const { result } = renderHook(() => useSnapshotAt('snapshots/a.json', retention), { wrapper })
      await waitFor(() => expect(result.current.outcome.kind).toBe('ready'))
      return api
    }

    it.each([
      ['window focus', focusEvent],
      ['reconnect', reconnectEvent],
    ])('refetches History on %s once five minutes old, not before', async (_name, trigger) => {
      const api = await mountAged('history')

      await vi.advanceTimersByTimeAsync(299_000)
      await act(async () => trigger())
      expect(api.requests).toEqual(['snapshots/a.json'])

      await vi.advanceTimersByTimeAsync(2_000)
      await act(async () => trigger())
      await waitFor(() => expect(api.requests).toEqual(['snapshots/a.json', 'snapshots/a.json']))
    })

    it.each([
      ['window focus', focusEvent],
      ['reconnect', reconnectEvent],
    ])('never refetches Latest on %s', async (_name, trigger) => {
      const api = await mountAged('latest')

      await vi.advanceTimersByTimeAsync(3_600_000)
      await act(async () => trigger())
      expect(api.requests).toEqual(['snapshots/a.json'])
    })
  })
})
