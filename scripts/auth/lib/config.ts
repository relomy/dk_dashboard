export const DEFAULT_AUTH_DB_NAME = 'dk-dashboard-db'

export function resolveAuthDatabaseName(env: Partial<Record<'AUTH_DB_NAME', string | undefined>>): string {
  return env.AUTH_DB_NAME ?? DEFAULT_AUTH_DB_NAME
}
