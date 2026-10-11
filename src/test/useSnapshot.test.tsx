import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useLatestSnapshot } from '../hooks/useSnapshot'

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
