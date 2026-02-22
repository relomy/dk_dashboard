import { describe, expect, it } from 'vitest'

import { writeAuditEvent } from '../audit'

type QueryKind = 'run'

interface MockD1 {
  prepare: (sql: string) => {
    bind: (...args: unknown[]) => {
      run: () => Promise<unknown>
    }
  }
  calls: Array<{ kind: QueryKind; sql: string; args: unknown[] }>
}

function createMockD1(): MockD1 {
  const calls: Array<{ kind: QueryKind; sql: string; args: unknown[] }> = []

  return {
    calls,
    prepare(sql: string) {
      return {
        bind: (...args: unknown[]) => ({
          run: async () => {
            calls.push({ kind: 'run', sql, args })
            return null
          },
        }),
      }
    },
  }
}

describe('writeAuditEvent', () => {
  it('inserts an auth_audit_log row with expected payload', async () => {
    const db = createMockD1()

    await writeAuditEvent(db, {
      id: 'audit_1',
      actorUserId: 'owner_1',
      action: 'user_deactivated',
      targetUserId: 'friend_1',
      metadataJson: '{"reason":"manual"}',
      ipHash: 'ip_hash',
      userAgent: 'Mozilla/5.0',
      createdAt: '2026-02-22T00:00:00Z',
    })

    expect(db.calls).toHaveLength(1)
    expect(db.calls[0].sql).toContain('INSERT INTO auth_audit_log')
    expect(db.calls[0].args[2]).toBe('user_deactivated')
  })
})
