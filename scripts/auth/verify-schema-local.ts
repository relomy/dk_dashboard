import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'

const DATABASE_NAME = process.env.AUTH_DB_NAME ?? 'dk-dashboard-auth'
const WRANGLER_LOG_PATH = process.env.WRANGLER_LOG_PATH ?? '.wrangler/logs'

mkdirSync(WRANGLER_LOG_PATH, { recursive: true })

function runWranglerQuery(sql: string): unknown {
  const raw = execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', DATABASE_NAME, '--local', '--json', '--command', sql],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        WRANGLER_LOG_PATH,
      },
    },
  )

  const firstBracket = Math.min(
    ...['[', '{']
      .map((token) => raw.indexOf(token))
      .filter((index) => index >= 0),
  )
  const jsonText = firstBracket >= 0 ? raw.slice(firstBracket) : raw
  return JSON.parse(jsonText) as unknown
}

function extractRows(payload: unknown): Array<Record<string, unknown>> {
  const rows: Array<Record<string, unknown>> = []

  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item)
      }
      return
    }

    if (!value || typeof value !== 'object') {
      return
    }

    const record = value as Record<string, unknown>
    const maybeResults = record.results

    if (Array.isArray(maybeResults) && maybeResults.every((item) => item && typeof item === 'object')) {
      rows.push(...(maybeResults as Array<Record<string, unknown>>))
      return
    }

    for (const nested of Object.values(record)) {
      visit(nested)
    }
  }

  visit(payload)
  return rows
}

function assertSingleNumericCount(sql: string, expected: number, label: string): void {
  const payload = runWranglerQuery(sql)
  const rows = extractRows(payload)

  if (rows.length !== 1) {
    throw new Error(`${label}: expected 1 row, received ${rows.length}`)
  }

  const value = Number(rows[0].count)
  if (!Number.isFinite(value) || value !== expected) {
    throw new Error(`${label}: expected ${expected}, received ${String(rows[0].count)}`)
  }
}

assertSingleNumericCount(
  "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name IN ('users', 'sessions', 'auth_audit_log');",
  3,
  'required tables',
)

assertSingleNumericCount("SELECT COUNT(*) AS count FROM pragma_table_info('sessions') WHERE name = 'token_hash';", 1, 'sessions.token_hash')

assertSingleNumericCount(
  "SELECT COUNT(*) AS count FROM pragma_table_info('users') WHERE name = 'must_change_password';",
  1,
  'users.must_change_password',
)

console.log('Local auth schema verification passed.')
