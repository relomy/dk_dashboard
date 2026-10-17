import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { onRequestGet } from '../snapshot'
import type { EnvBindings } from '../../_shared/types'

type QueryKind = 'first' | 'all' | 'run'

interface D1Call {
  kind: QueryKind
  sql: string
  args: unknown[]
}

interface MockD1 {
  prepare: D1Database['prepare']
  calls: D1Call[]
}

interface MockR2Object {
  text: () => Promise<string>
}

interface MockR2Bucket {
  get: (key: string) => Promise<MockR2Object | null>
}

function createMockDb(sessionRow: Record<string, unknown> | null): MockD1 {
  const calls: D1Call[] = []
  return {
    calls,
    prepare(sql: string) {
      return {
        bind: (...args: unknown[]) => ({
          first: async () => {
            calls.push({ kind: 'first', sql, args })
            if (sql.includes('FROM sessions')) {
              return sessionRow
            }
            return null
          },
          all: async () => {
            calls.push({ kind: 'all', sql, args })
            return { results: [] as Record<string, unknown>[] }
          },
          run: async () => {
            calls.push({ kind: 'run', sql, args })
            return {}
          },
        }),
      } as ReturnType<D1Database['prepare']>
    },
  }
}

type TestEnv = Omit<EnvBindings, 'dk_dashboard_data' | 'AUTH_DB'> & {
  dk_dashboard_data: MockR2Bucket
  AUTH_DB: MockD1
}

function buildEnv(overrides: Partial<TestEnv> = {}): TestEnv {
  return {
    SESSION_PEPPER: 'pepper_secret',
    AUTH_DB: createMockDb({
      session_id: 's1',
      user_id: 'u1',
      username: 'friend',
      role: 'friend',
      must_change_password: 0,
      password_hash: 'pbkdf2_sha256$1$salt$hash',
    }),
    dk_dashboard_data: {
      get: async () => null,
    },
    ...overrides,
  }
}

const waitUntilPromises: Promise<unknown>[] = []

async function invoke(path: string, env: TestEnv, headers?: HeadersInit): Promise<Response> {
  return onRequestGet({
    request: new Request(`https://example.com/api/snapshot${path}`, {
      headers,
    }),
    env,
    waitUntil: (promise: Promise<unknown>) => {
      waitUntilPromises.push(promise)
    },
  } as Parameters<typeof onRequestGet>[0])
}

interface StubCache {
  store: Map<string, Response>
  matchKeys: string[]
  putKeys: string[]
  match: (request: Request) => Promise<Response | undefined>
  put: (request: Request, response: Response) => Promise<void>
}

function createStubCache(options: { failPut?: boolean } = {}): StubCache {
  const store = new Map<string, Response>()
  const matchKeys: string[] = []
  const putKeys: string[] = []
  return {
    store,
    matchKeys,
    putKeys,
    match: async (request) => {
      matchKeys.push(request.url)
      return store.get(request.url)?.clone()
    },
    put: async (request, response) => {
      putKeys.push(request.url)
      if (options.failPut) {
        throw new Error('cache put failed')
      }
      store.set(request.url, response)
    },
  }
}

const authHeaders = { Cookie: 'session_token=tok_1' }

function envWithR2(body: unknown, onGet?: (key: string) => void): TestEnv {
  return buildEnv({
    dk_dashboard_data: {
      get: async (key) => {
        onGet?.(key)
        return { text: async () => JSON.stringify(body) }
      },
    },
  })
}

describe('/api/snapshot', () => {
  let cache: StubCache
  beforeEach(() => {
    cache = createStubCache()
    waitUntilPromises.length = 0
    vi.stubGlobal('caches', { default: cache })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns 401 JSON error when session is missing', async () => {
    const response = await invoke('?path=snapshots/live.json', buildEnv())

    expect(response.status).toBe(401)
    expect(response.headers.get('cache-control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'unauthenticated',
        message: 'Authentication required.',
      },
    })
  })

  it('returns 400 JSON error when path is invalid', async () => {
    const response = await invoke('?path=../secret.json', buildEnv(), {
      Cookie: 'session_token=tok_1',
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'invalid_path',
        message: 'Invalid path. Use snapshots/* or manifest/* keys only.',
      },
    })
  })

  it('returns 500 JSON error when SESSION_PEPPER is missing', async () => {
    const response = await invoke('?path=snapshots/live.json', buildEnv({ SESSION_PEPPER: undefined }), {
      Cookie: 'session_token=tok_1',
    })

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'server_misconfigured',
        message: 'SESSION_PEPPER is not configured.',
      },
    })
  })

  it('returns 404 JSON error when snapshot key is not found in R2', async () => {
    const response = await invoke('?path=snapshots/live.json', buildEnv(), {
      Cookie: 'session_token=tok_1',
    })

    expect(response.status).toBe(404)
    expect(response.headers.get('cache-control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'snapshot_not_found',
        message: 'Not found: snapshots/live.json',
      },
    })
  })

  it('returns 200 for snapshots path with cache header', async () => {
    const response = await invoke(
      '?path=snapshots/live.json',
      buildEnv({
        dk_dashboard_data: {
          get: async () => ({
            text: async () => JSON.stringify({ schema_version: 2 }),
          }),
        },
      }),
      { Cookie: 'session_token=tok_1' },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8')
    expect(response.headers.get('cache-control')).toBe('private, max-age=31536000, immutable')
    await expect(response.json()).resolves.toEqual({ schema_version: 2 })
  })

  it('returns 200 for manifest path with no-store cache header', async () => {
    const response = await invoke(
      '?path=manifest/2026-02-22.json',
      buildEnv({
        dk_dashboard_data: {
          get: async () => ({
            text: async () => JSON.stringify({ date: '2026-02-22' }),
          }),
        },
      }),
      { Cookie: 'session_token=tok_1' },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8')
    expect(response.headers.get('cache-control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({ date: '2026-02-22' })
  })

  it('stores a public 24-hour copy on a miss and reports miss', async () => {
    const gets: string[] = []
    const response = await invoke(
      '?path=snapshots/a.json',
      envWithR2({ n: 1 }, (k) => gets.push(k)),
      authHeaders,
    )
    await Promise.all(waitUntilPromises)

    expect(gets).toEqual(['snapshots/a.json'])
    expect(response.headers.get('x-snapshot-cache')).toBe('miss')
    expect(response.headers.get('cache-control')).toBe('private, max-age=31536000, immutable')
    await expect(response.json()).resolves.toEqual({ n: 1 })
    const stored = cache.store.get('https://example.com/api/snapshot?path=snapshots/a.json')
    expect(stored?.headers.get('cache-control')).toBe('public, max-age=86400')
    await expect(stored?.json()).resolves.toEqual({ n: 1 })
  })

  it('returns the stored copy on a hit without reading R2', async () => {
    await invoke('?path=snapshots/a.json', envWithR2({ n: 1 }), authHeaders)
    await Promise.all(waitUntilPromises)

    const gets: string[] = []
    const response = await invoke(
      '?path=snapshots/a.json',
      envWithR2({ n: 2 }, (k) => gets.push(k)),
      authHeaders,
    )

    expect(gets).toEqual([])
    expect(response.status).toBe(200)
    expect(response.headers.get('x-snapshot-cache')).toBe('hit')
    expect(response.headers.get('cache-control')).toBe('private, max-age=31536000, immutable')
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8')
    await expect(response.json()).resolves.toEqual({ n: 1 })
  })

  it('never reads the cache for an unauthenticated request', async () => {
    cache.store.set('https://example.com/api/snapshot?path=snapshots/a.json', new Response('{"secret":true}'))

    const response = await invoke('?path=snapshots/a.json', buildEnv())

    expect(response.status).toBe(401)
    expect(cache.matchKeys).toEqual([])
    expect(cache.putKeys).toEqual([])
  })

  it('never touches the cache for manifest paths', async () => {
    const response = await invoke('?path=manifest/2026-02-22.json', envWithR2({ date: 'x' }), authHeaders)
    await Promise.all(waitUntilPromises)

    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.has('x-snapshot-cache')).toBe(false)
    expect(cache.matchKeys).toEqual([])
    expect(cache.putKeys).toEqual([])
  })

  it('does not store a 404 and a later snapshot is served', async () => {
    const missing = await invoke('?path=snapshots/a.json', buildEnv(), authHeaders)
    await Promise.all(waitUntilPromises)

    expect(missing.status).toBe(404)
    expect(cache.putKeys).toEqual([])

    const found = await invoke('?path=snapshots/a.json', envWithR2({ n: 1 }), authHeaders)
    expect(found.status).toBe(200)
  })

  it('does not store an invalid-path error', async () => {
    const response = await invoke('?path=../secret.json', buildEnv(), authHeaders)

    expect(response.status).toBe(400)
    expect(cache.matchKeys).toEqual([])
    expect(cache.putKeys).toEqual([])
  })

  it('still returns the snapshot when the cache write fails', async () => {
    cache = createStubCache({ failPut: true })
    vi.stubGlobal('caches', { default: cache })

    const response = await invoke('?path=snapshots/a.json', envWithR2({ n: 1 }), authHeaders)
    await expect(Promise.all(waitUntilPromises)).resolves.toBeDefined()

    expect(response.status).toBe(200)
    expect(response.headers.get('x-snapshot-cache')).toBe('miss')
    await expect(response.json()).resolves.toEqual({ n: 1 })
  })

  it('falls back to R2 when the cache read fails', async () => {
    cache.match = async () => {
      throw new Error('cache match failed')
    }

    const response = await invoke('?path=snapshots/a.json', envWithR2({ n: 1 }), authHeaders)

    expect(response.status).toBe(200)
    expect(response.headers.get('x-snapshot-cache')).toBe('miss')
    await expect(response.json()).resolves.toEqual({ n: 1 })
  })
})
