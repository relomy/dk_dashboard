import { describe, expect, it } from 'vitest'

import {
  bootstrapOwner,
  resetLocalAuth,
  resetOwnerPassword,
  type SqlRunner,
} from '../lib/commands'

interface QueryExpectation {
  includes: string
  rows: Array<Record<string, unknown>>
}

class MockRunner implements SqlRunner {
  public readonly statements: string[] = []
  private readonly queryExpectations: QueryExpectation[]

  public constructor(queryExpectations: QueryExpectation[] = []) {
    this.queryExpectations = queryExpectations
  }

  public async query(sql: string): Promise<Array<Record<string, unknown>>> {
    this.statements.push(sql)
    const match = this.queryExpectations.find((entry) => sql.includes(entry.includes))
    return match?.rows ?? []
  }

  public async execute(sql: string): Promise<void> {
    this.statements.push(sql)
  }
}

describe('auth command flows', () => {
  it('bootstrap-owner is single-use unless force is enabled', async () => {
    const existingOwnerRunner = new MockRunner([
      { includes: "role = 'owner'", rows: [{ count: 1 }] },
    ])

    await expect(
      bootstrapOwner(existingOwnerRunner, {
        username: 'owner',
        nowIso: '2026-02-22T00:00:00.000Z',
      }),
    ).rejects.toThrow('Owner already exists. Use --force to override.')

    const forcedRunner = new MockRunner([
      { includes: "role = 'owner'", rows: [{ count: 1 }] },
      { includes: 'WHERE username =', rows: [] },
    ])
    const forced = await bootstrapOwner(forcedRunner, {
      username: 'owner2',
      force: true,
      nowIso: '2026-02-22T00:00:00.000Z',
      temporaryPassword: 'TempPass123!ABC',
    })
    expect(forced.username).toBe('owner2')
    expect(forced.temporaryPassword).toBe('TempPass123!ABC')
    expect(forcedRunner.statements.some((sql) => sql.includes('INSERT INTO users'))).toBe(true)
  })

  it('reset-owner-password requires username and confirmation', async () => {
    const runner = new MockRunner()
    await expect(
      resetOwnerPassword(runner, {
        username: '',
        confirm: true,
        nowIso: '2026-02-22T00:00:00.000Z',
      }),
    ).rejects.toThrow('username is required')

    await expect(
      resetOwnerPassword(runner, {
        username: 'owner',
        confirm: false,
        nowIso: '2026-02-22T00:00:00.000Z',
      }),
    ).rejects.toThrow('confirmation flag is required')
  })

  it('reset-local clears auth tables then reseeds owner', async () => {
    const runner = new MockRunner([
      { includes: "role = 'owner'", rows: [{ count: 0 }] },
      { includes: 'WHERE username =', rows: [] },
    ])

    const result = await resetLocalAuth(runner, {
      username: 'owner_local',
      nowIso: '2026-02-22T00:00:00.000Z',
      temporaryPassword: 'TempPass123!ABC',
    })

    expect(result.username).toBe('owner_local')
    expect(result.temporaryPassword).toBe('TempPass123!ABC')
    expect(runner.statements[0]).toContain('DELETE FROM auth_audit_log')
    expect(runner.statements[1]).toContain('DELETE FROM sessions')
    expect(runner.statements[2]).toContain('DELETE FROM users')
    expect(runner.statements.some((sql) => sql.includes('INSERT INTO users'))).toBe(true)
  })
})
