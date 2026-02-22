import { describe, expect, it } from 'vitest'

import { resolveAuthDatabaseName } from '../lib/config'

describe('auth config', () => {
  it('uses AUTH_DB_NAME when provided', () => {
    expect(resolveAuthDatabaseName({ AUTH_DB_NAME: 'custom-db' })).toBe('custom-db')
  })

  it('defaults to dk-dashboard-db when AUTH_DB_NAME is not set', () => {
    expect(resolveAuthDatabaseName({})).toBe('dk-dashboard-db')
  })
})
