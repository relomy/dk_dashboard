import { describe, expect, it } from 'vitest'

import { onRequestPost } from '../login'
import { hashPassword } from '../../../_shared/password'
import type { EnvBindings } from '../../../_shared/types'

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

interface UserRow {
  id: string
  username: string
  password_hash: string
  role: 'owner' | 'friend'
  is_active: number
  must_change_password: number
  temp_password_expires_at: string | null
  created_at: string
  updated_at: string
  last_login_at: string | null
}

function createMockDb(user: UserRow | null): MockD1 {
  const calls: D1Call[] = []

  const db: MockD1 = {
    calls,
    prepare(sql: string) {
      return {
        bind: (...args: unknown[]) => ({
          first: async () => {
            calls.push({ kind: 'first', sql, args })
            if (sql.includes('FROM users')) {
              return user
            }
            return null
          },
          all: async () => {
            calls.push({ kind: 'all', sql, args })
            if (sql.includes('FROM sessions')) {
              return { results: [] as Record<string, unknown>[] }
            }
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

  return db
}

type TestEnv = Omit<EnvBindings, 'AUTH_DB' | 'dk_dashboard_data'> & {
  AUTH_DB: MockD1
  dk_dashboard_data: { get: (key: string) => Promise<null> }
}

function buildEnv(overrides: Partial<TestEnv> = {}): TestEnv {
  return {
    AUTH_DB: createMockDb(null),
    SESSION_PEPPER: 'pepper_secret',
    ALLOWED_ORIGINS: 'https://preview.dashboard.pages.dev',
    dk_dashboard_data: {
      get: async () => null,
    },
    ...overrides,
  }
}

async function invoke(request: Request, env: TestEnv): Promise<Response> {
  return onRequestPost({
    request,
    env,
  } as Parameters<typeof onRequestPost>[0])
}

function loginRequest(
  body: Record<string, unknown>,
  options: {
    origin?: string
    csrfCookie?: string
    csrfHeader?: string
  } = {},
): Request {
  const headers: HeadersInit = {
    'content-type': 'application/json',
  }

  if (options.origin) {
    headers.Origin = options.origin
  }
  if (options.csrfHeader) {
    headers['X-CSRF-Token'] = options.csrfHeader
  }
  if (options.csrfCookie) {
    headers.Cookie = `csrf_token=${options.csrfCookie}`
  }

  return new Request('https://dashboard.example/api/auth/login', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

describe('/api/auth/login', () => {
  it('rejects missing origin or referer', async () => {
    const response = await invoke(
      loginRequest({ username: 'friend', password: 'secret' }, { csrfCookie: 'abc', csrfHeader: 'abc' }),
      buildEnv(),
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'csrf_failed',
        message: 'Invalid request origin.',
      },
    })
  })

  it('rejects missing csrf token pair', async () => {
    const response = await invoke(
      loginRequest({ username: 'friend', password: 'secret' }, { origin: 'https://dashboard.example' }),
      buildEnv(),
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'csrf_failed',
        message: 'Invalid CSRF token.',
      },
    })
  })

  it('returns generic unauthorized for invalid credentials', async () => {
    const response = await invoke(
      loginRequest(
        { username: 'friend', password: 'wrong' },
        { origin: 'https://dashboard.example', csrfCookie: 'abc', csrfHeader: 'abc' },
      ),
      buildEnv({ AUTH_DB: createMockDb(null) }),
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'unauthenticated',
        message: 'Invalid username or password.',
      },
    })
  })

  it('rejects inactive users and expired temp passwords', async () => {
    const passwordHash = await hashPassword('secret')
    const inactiveUser: UserRow = {
      id: 'u1',
      username: 'friend',
      password_hash: passwordHash,
      role: 'friend',
      is_active: 0,
      must_change_password: 0,
      temp_password_expires_at: null,
      created_at: '2026-02-22T00:00:00Z',
      updated_at: '2026-02-22T00:00:00Z',
      last_login_at: null,
    }
    const expiredTempUser: UserRow = {
      ...inactiveUser,
      is_active: 1,
      must_change_password: 1,
      temp_password_expires_at: '2026-02-21T00:00:00Z',
    }

    const baseReq = {
      origin: 'https://dashboard.example',
      csrfCookie: 'abc',
      csrfHeader: 'abc',
    }

    const inactiveResp = await invoke(loginRequest({ username: 'friend', password: 'secret' }, baseReq), buildEnv({ AUTH_DB: createMockDb(inactiveUser) }))
    const expiredResp = await invoke(loginRequest({ username: 'friend', password: 'secret' }, baseReq), buildEnv({ AUTH_DB: createMockDb(expiredTempUser) }))

    expect(inactiveResp.status).toBe(401)
    expect(expiredResp.status).toBe(401)
  })

  it('fails closed when SESSION_PEPPER is missing', async () => {
    const passwordHash = await hashPassword('secret')
    const user: UserRow = {
      id: 'u1',
      username: 'friend',
      password_hash: passwordHash,
      role: 'friend',
      is_active: 1,
      must_change_password: 0,
      temp_password_expires_at: null,
      created_at: '2026-02-22T00:00:00Z',
      updated_at: '2026-02-22T00:00:00Z',
      last_login_at: null,
    }

    const response = await invoke(
      loginRequest(
        { username: 'friend', password: 'secret' },
        { origin: 'https://dashboard.example', csrfCookie: 'abc', csrfHeader: 'abc' },
      ),
      buildEnv({ AUTH_DB: createMockDb(user), SESSION_PEPPER: undefined }),
    )

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'server_misconfigured',
        message: 'SESSION_PEPPER is not configured.',
      },
    })
  })

  it('creates session, emits audit event, and sets session/csrf cookies on success', async () => {
    const passwordHash = await hashPassword('secret')
    const user: UserRow = {
      id: 'u1',
      username: 'friend',
      password_hash: passwordHash,
      role: 'friend',
      is_active: 1,
      must_change_password: 1,
      temp_password_expires_at: null,
      created_at: '2026-02-22T00:00:00Z',
      updated_at: '2026-02-22T00:00:00Z',
      last_login_at: null,
    }

    const db = createMockDb(user)
    const response = await invoke(
      loginRequest(
        { username: 'friend', password: 'secret' },
        { origin: 'https://dashboard.example', csrfCookie: 'abc', csrfHeader: 'abc' },
      ),
      buildEnv({ AUTH_DB: db }),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      user: {
        id: 'u1',
        username: 'friend',
        role: 'friend',
        must_change_password: true,
      },
    })

    const setCookie = response.headers.get('set-cookie')
    expect(setCookie).toContain('session_token=')
    expect(setCookie).toContain('csrf_token=')
    expect(db.calls.some((call) => call.sql.includes('INSERT INTO sessions'))).toBe(true)
    expect(db.calls.some((call) => call.sql.includes('INSERT INTO auth_audit_log'))).toBe(true)
  })
})
