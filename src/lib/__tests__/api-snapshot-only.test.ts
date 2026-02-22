import { describe, expect, it, vi } from 'vitest'

vi.mock('../env', () => ({
  config: {
    apiBaseUrl: '',
    useMock: true,
    mockSnapshotOnly: true,
    mockSnapshotPath: 'snapshots/canonical-live-snapshot.v2.json',
  },
}))

describe('fetchJson snapshot-only mock mode', () => {
  it('satisfies /api/latest locally without fetching', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const { fetchJson } = await import('../api')
    const latest = await fetchJson<{
      latest_snapshot_path: string
      manifest_today_path: string
    }>('/api/latest')

    expect(latest.latest_snapshot_path).toBe('snapshots/canonical-live-snapshot.v2.json')
    expect(latest.manifest_today_path).toBe('')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('maps /api/snapshot path to /mock and fetches it', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ contests: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      }),
    )
    vi.stubGlobal('fetch', fetchSpy)

    const { fetchJson } = await import('../api')
    const payload = await fetchJson<{ contests: unknown[] }>(
      '/api/snapshot?path=snapshots/canonical-live-snapshot.v2.json',
    )

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy.mock.calls[0][0]).toBe('/mock/snapshots/canonical-live-snapshot.v2.json')
    expect(payload).toEqual({ contests: [] })
  })
})
