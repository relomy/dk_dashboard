import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'

import type { SqlRunner } from './commands'

const WRANGLER_LOG_PATH = process.env.WRANGLER_LOG_PATH ?? '.wrangler/logs'

function parseJsonPayload(raw: string): unknown {
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

function runWranglerSql(databaseName: string, sql: string, remote: boolean): Array<Record<string, unknown>> {
  mkdirSync(WRANGLER_LOG_PATH, { recursive: true })
  const args = ['wrangler', 'd1', 'execute', databaseName, '--json', '--command', sql]
  args.push(remote ? '--remote' : '--local')

  const raw = execFileSync('npx', args, {
    encoding: 'utf8',
    env: {
      ...process.env,
      WRANGLER_LOG_PATH,
    },
  })

  return extractRows(parseJsonPayload(raw))
}

export function createWranglerRunner(options: {
  databaseName: string
  remote?: boolean
}): SqlRunner {
  const remote = Boolean(options.remote)
  return {
    async query(sql: string): Promise<Array<Record<string, unknown>>> {
      return runWranglerSql(options.databaseName, sql, remote)
    },
    async execute(sql: string): Promise<void> {
      runWranglerSql(options.databaseName, sql, remote)
    },
  }
}
