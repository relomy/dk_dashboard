import { describe, expect, it } from 'vitest'

import {
  createUser,
  findUserByUsername,
  insertSession,
  pruneSessionsToLimit,
  revokeAllSessionsForUser,
  revokeSessionById,
  rotateSession,
} from '../authRepo'

type QueryKind = 'all' | 'first' | 'run'

interface Prepared {
  bind: (...args: unknown[]) => {
    all: () => Promise<{ results: Array<Record<string, unknown>> }>
    first: () => Promise<Record<string, unknown> | null>
    run: () => Promise<unknown>
  }
}

interface MockD1 {
  prepare: (sql: string) => Prepared
  calls: Array<{ kind: QueryKind; sql: string; args: unknown[] }>
}

function createMockD1(
  handler: (kind: QueryKind, sql: string, args: unknown[]) => unknown,
): MockD1 {
  const calls: Array<{ kind: QueryKind; sql: string; args: unknown[] }> = []

  return {
    calls,
    prepare(sql: string): Prepared {
      return {
        bind: (...args: unknown[]) => ({
          all: async () => {
            calls.push({ kind: 'all', sql, args })
            return { results: (handler('all', sql, args) as Array<Record<string, unknown>>) ?? [] }
          },
          first: async () => {
            calls.push({ kind: 'first', sql, args })
            return (handler('first', sql, args) as Record<string, unknown> | null) ?? null
          },
          run: async () => {
            calls.push({ kind: 'run', sql, args })
            return handler('run', sql, args)
          },
        }),
      }
    },
  }
}

describe('authRepo', () => {
  it('creates and reads users by username', async () => {
    const db = createMockD1((kind, sql, args) => {
      if (kind === 'first' && sql.includes('FROM users') && args[0] === 'friend_one') {
        return {
          id: 'user_1',
          username: 'friend_one',
          role: 'friend',
          is_active: 1,
          must_change_password: 1,
        }
      }
      return null
    })

    await createUser(db, {
      id: 'user_1',
      username: 'friend_one',
      passwordHash: 'hash',
      role: 'friend',
      isActive: true,
      mustChangePassword: true,
      tempPasswordExpiresAt: null,
      createdAt: '2026-02-22T00:00:00Z',
      updatedAt: '2026-02-22T00:00:00Z',
    })

    const user = await findUserByUsername(db, 'friend_one')
    expect(user?.username).toBe('friend_one')
    expect(db.calls.some((call) => call.sql.includes('INSERT INTO users'))).toBe(true)
    expect(db.calls.some((call) => call.sql.includes('SELECT * FROM users'))).toBe(true)
  })

  it('handles session insert/revoke/rotate/prune and revoke-all', async () => {
    const db = createMockD1((kind, sql) => {
      if (kind === 'all' && sql.includes('FROM sessions')) {
        return [{ id: 's1' }, { id: 's2' }, { id: 's3' }, { id: 's4' }]
      }
      return null
    })

    await insertSession(db, {
      id: 's5',
      userId: 'user_1',
      tokenHash: 'th_1',
      expiresAt: '2026-02-22T08:00:00Z',
      createdAt: '2026-02-22T00:00:00Z',
      rotatedFromSessionId: null,
      ipHash: null,
      userAgent: null,
    })

    await revokeSessionById(db, 's5', '2026-02-22T00:10:00Z')
    await rotateSession(db, {
      oldSessionId: 's3',
      revokedAt: '2026-02-22T00:20:00Z',
      nextSession: {
        id: 's6',
        userId: 'user_1',
        tokenHash: 'th_2',
        expiresAt: '2026-02-22T08:20:00Z',
        createdAt: '2026-02-22T00:20:00Z',
        rotatedFromSessionId: 's3',
        ipHash: null,
        userAgent: null,
      },
    })

    const revoked = await pruneSessionsToLimit(db, 'user_1', 3, '2026-02-22T00:30:00Z')
    expect(revoked).toBe(1)

    await revokeAllSessionsForUser(db, 'user_1', '2026-02-22T00:40:00Z')

    expect(db.calls.some((call) => call.sql.includes('INSERT INTO sessions'))).toBe(true)
    expect(db.calls.some((call) => call.sql.includes('UPDATE sessions SET revoked_at'))).toBe(true)
    expect(db.calls.some((call) => call.sql.includes('WHERE user_id = ?'))).toBe(true)
  })
})
