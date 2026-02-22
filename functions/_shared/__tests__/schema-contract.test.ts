import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

async function readSql(relativePath: string): Promise<string> {
  const fileUrl = new URL(relativePath, import.meta.url)
  return readFile(fileUrl, 'utf8')
}

describe('auth schema migration contract', () => {
  it('defines required tables and columns', async () => {
    const coreSql = await readSql('../../../migrations/0001_auth_core.sql')
    const indexSql = await readSql('../../../migrations/0002_auth_indexes.sql')

    const sql = `${coreSql}\n${indexSql}`

    expect(sql).toMatch(/CREATE TABLE(?: IF NOT EXISTS)? users/i)
    expect(sql).toMatch(/CREATE TABLE(?: IF NOT EXISTS)? sessions/i)
    expect(sql).toMatch(/CREATE TABLE(?: IF NOT EXISTS)? auth_audit_log/i)

    expect(sql).toContain('token_hash')
    expect(sql).toContain('must_change_password')
  })
})
