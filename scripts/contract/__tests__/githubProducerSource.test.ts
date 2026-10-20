import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { githubProducerSource } from '../lib/githubProducerSource'

const COMMIT = 'a'.repeat(40)
const listing = JSON.stringify([
  { name: 'one.json', type: 'file' },
  { name: 'notes.md', type: 'file' },
  { name: 'sub', type: 'dir' },
])

function response(status: number, body = ''): Response {
  return new Response(body, { status })
}

describe('githubProducerSource', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    fetchMock.mockReset()
  })

  it('sends GITHUB_TOKEN to the API only, not to raw content', async () => {
    vi.stubEnv('GITHUB_TOKEN', 'secret')
    fetchMock.mockImplementation(async () => response(200, listing))

    await githubProducerSource.listGoldens(COMMIT)
    await githubProducerSource.readSchema(COMMIT)

    const [apiInit, rawInit] = fetchMock.mock.calls.map((call) => call[1] as { headers: Record<string, string> })
    expect(apiInit.headers.Authorization).toBe('Bearer secret')
    expect(rawInit.headers.Authorization).toBeUndefined()
  })

  it('stays anonymous without a token and lists only JSON files', async () => {
    vi.stubEnv('GITHUB_TOKEN', '')
    fetchMock.mockResolvedValue(response(200, listing))

    await expect(githubProducerSource.listGoldens(COMMIT)).resolves.toEqual(['one.json'])
    expect((fetchMock.mock.calls[0][1] as { headers: Record<string, string> }).headers.Authorization).toBeUndefined()
  })

  it('retries a transient failure and then succeeds', async () => {
    fetchMock.mockResolvedValueOnce(response(503)).mockResolvedValueOnce(response(200, listing))

    const result = githubProducerSource.listGoldens(COMMIT)
    await vi.runAllTimersAsync()

    await expect(result).resolves.toEqual(['one.json'])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not retry a 403 and gives up after three attempts on 5xx', async () => {
    fetchMock.mockResolvedValueOnce(response(403))
    await expect(githubProducerSource.listGoldens(COMMIT)).rejects.toThrow('HTTP 403')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    fetchMock.mockReset()
    fetchMock.mockResolvedValue(response(502))
    const failed = githubProducerSource.listGoldens(COMMIT).catch((error: Error) => error)
    await vi.runAllTimersAsync()
    expect(String(await failed)).toContain('HTTP 502')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
