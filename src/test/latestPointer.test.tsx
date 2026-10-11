import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useHistoryTimeline } from '../hooks/useHistoryTimeline'
import { useLatestPointer, useLatestSnapshot } from '../hooks/useSnapshot'

// The Latest pointer is read through the snapshot module; a fake fetch stands in for the dashboard API.

afterEach(() => {
  vi.unstubAllGlobals()
  cleanup()
})

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

const pointerBody = {
  latest_snapshot_path: 'snapshots/a.json',
  snapshot_at: '2026-10-03T20:48:31Z',
  generated_at: '2026-10-03T20:48:31Z',
  available_sports: ['nfl'],
  manifest_today_path: 'manifests/today.json',
  manifest_yesterday_path: 'manifests/yesterday.json',
}

function fakeApi(pointer: () => Response = () => json(pointerBody)) {
  const requests: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost')
      requests.push(url.pathname === '/api/snapshot' ? url.searchParams.get('path')! : url.pathname)
      if (url.pathname === '/api/latest') return pointer()
      if (url.searchParams.get('path') === 'manifests/today.json') return json({ snapshots: [] })
      return json({ schema_version: 3, snapshot_at: pointerBody.snapshot_at, sports: {} })
    }),
  )
  return requests
}

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useLatestPointer', () => {
  it('is loading, then carries the pointer fields callers use', async () => {
    fakeApi()
    const { result } = renderHook(() => useLatestPointer({ enabled: true }), { wrapper: wrapper() })

    expect(result.current).toMatchObject({ isLoading: true, pointer: undefined })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current).toEqual({
      pointer: {
        latest_snapshot_path: 'snapshots/a.json',
        snapshot_at: '2026-10-03T20:48:31Z',
        manifest_today_path: 'manifests/today.json',
        manifest_yesterday_path: 'manifests/yesterday.json',
      },
      isLoading: false,
      error: null,
    })
  })

  it('carries the error when the pointer cannot be fetched', async () => {
    fakeApi(() => json({}, 500))
    const { result } = renderHook(() => useLatestPointer({ enabled: true }), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.error).toMatchObject({ message: 'Request failed (500)' }))
    expect(result.current.pointer).toBeUndefined()
    expect(result.current.isLoading).toBe(false)
  })

  it('does not fetch when disabled', async () => {
    const requests = fakeApi()
    const { result } = renderHook(() => useLatestPointer({ enabled: false }), { wrapper: wrapper() })

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(requests).toEqual([])
    expect(result.current).toEqual({ pointer: undefined, isLoading: false, error: null })
  })

  it('shares one /api/latest fetch between the Latest snapshot and the history timeline', async () => {
    const requests = fakeApi()
    const { result } = renderHook(() => ({ latest: useLatestSnapshot(), timeline: useHistoryTimeline(true) }), {
      wrapper: wrapper(),
    })

    await waitFor(() => expect(result.current.latest.kind).toBe('ready'))
    await waitFor(() => expect(result.current.timeline.todayManifestQuery.isSuccess).toBe(true))
    expect(requests.filter((request) => request === '/api/latest')).toHaveLength(1)
  })
})
