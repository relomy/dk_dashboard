import { hashPassword } from '../../../functions/_shared/password'

export interface SqlRunner {
  query(sql: string): Promise<Array<Record<string, unknown>>>
  execute(sql: string): Promise<void>
}

export interface CommandResult {
  username: string
  temporaryPassword: string
}

function randomToken(bytes = 16): string {
  const tokenBytes = new Uint8Array(bytes)
  crypto.getRandomValues(tokenBytes)
  return Array.from(tokenBytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''")
}

function isoPlusHours(baseIso: string, hours: number): string {
  return new Date(new Date(baseIso).getTime() + hours * 60 * 60 * 1000).toISOString()
}

function parseCount(rows: Array<Record<string, unknown>>, key = 'count'): number {
  if (rows.length === 0) {
    return 0
  }
  return Number(rows[0][key] ?? 0)
}

function buildTempPassword(length = 18): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*'
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  let password = ''
  for (const byte of bytes) {
    password += alphabet[byte % alphabet.length]
  }
  return password
}

function resolveTemporaryPassword(override: string | undefined): string {
  if (override && override.length < 12) {
    throw new Error('temporary password must be at least 12 characters')
  }
  return override ?? buildTempPassword()
}

export async function bootstrapOwner(
  runner: SqlRunner,
  options: {
    username: string
    temporaryPassword?: string
    force?: boolean
    nowIso?: string
  },
): Promise<CommandResult> {
  const username = options.username.trim().toLowerCase()
  if (!username) {
    throw new Error('username is required')
  }

  const ownerRows = await runner.query("SELECT COUNT(*) AS count FROM users WHERE role = 'owner' AND is_active = 1;")
  const activeOwnerCount = parseCount(ownerRows)
  if (activeOwnerCount > 0 && !options.force) {
    throw new Error('Owner already exists. Use --force to override.')
  }

  const existingRows = await runner.query(
    `SELECT id FROM users WHERE username = '${escapeSqlString(username)}' LIMIT 1;`,
  )
  if (existingRows.length > 0) {
    throw new Error('Username already exists.')
  }

  const nowIso = options.nowIso ?? new Date().toISOString()
  const temporaryPassword = resolveTemporaryPassword(options.temporaryPassword)
  const passwordHash = await hashPassword(temporaryPassword)
  const userId = `usr_${randomToken(12)}`
  const expiresAt = isoPlusHours(nowIso, 24)

  await runner.execute(
    `INSERT INTO users (id, username, password_hash, role, is_active, must_change_password, temp_password_expires_at, created_at, updated_at)
     VALUES ('${userId}', '${escapeSqlString(username)}', '${escapeSqlString(passwordHash)}', 'owner', 1, 1, '${expiresAt}', '${nowIso}', '${nowIso}');`,
  )
  await runner.execute(
    `INSERT INTO auth_audit_log (id, actor_user_id, action, target_user_id, metadata_json, ip_hash, user_agent, created_at)
     VALUES ('audit_${randomToken(12)}', NULL, 'bootstrap_owner', '${userId}', NULL, NULL, NULL, '${nowIso}');`,
  )

  return {
    username,
    temporaryPassword,
  }
}

export async function resetOwnerPassword(
  runner: SqlRunner,
  options: {
    username: string
    confirm: boolean
    temporaryPassword?: string
    nowIso?: string
  },
): Promise<CommandResult> {
  const username = options.username.trim().toLowerCase()
  if (!username) {
    throw new Error('username is required')
  }
  if (!options.confirm) {
    throw new Error('confirmation flag is required')
  }

  const ownerRows = await runner.query(
    `SELECT id, role FROM users WHERE username = '${escapeSqlString(username)}' LIMIT 1;`,
  )
  const owner = ownerRows[0]
  if (!owner) {
    throw new Error('Owner user not found.')
  }
  if (String(owner.role) !== 'owner') {
    throw new Error('Target user must have owner role.')
  }

  const nowIso = options.nowIso ?? new Date().toISOString()
  const temporaryPassword = resolveTemporaryPassword(options.temporaryPassword)
  const passwordHash = await hashPassword(temporaryPassword)
  const expiresAt = isoPlusHours(nowIso, 24)
  const ownerId = String(owner.id)

  await runner.execute(
    `UPDATE users SET password_hash = '${escapeSqlString(passwordHash)}', must_change_password = 1, temp_password_expires_at = '${expiresAt}', updated_at = '${nowIso}' WHERE id = '${escapeSqlString(ownerId)}';`,
  )
  await runner.execute(
    `UPDATE sessions SET revoked_at = '${nowIso}' WHERE user_id = '${escapeSqlString(ownerId)}' AND revoked_at IS NULL;`,
  )
  await runner.execute(
    `INSERT INTO auth_audit_log (id, actor_user_id, action, target_user_id, metadata_json, ip_hash, user_agent, created_at)
     VALUES ('audit_${randomToken(12)}', NULL, 'reset_owner_password', '${escapeSqlString(ownerId)}', NULL, NULL, NULL, '${nowIso}');`,
  )

  return {
    username,
    temporaryPassword,
  }
}

export async function resetLocalAuth(
  runner: SqlRunner,
  options: {
    username: string
    temporaryPassword?: string
    nowIso?: string
  },
): Promise<CommandResult> {
  await runner.execute('DELETE FROM auth_audit_log;')
  await runner.execute('DELETE FROM sessions;')
  await runner.execute('DELETE FROM users;')

  return bootstrapOwner(runner, {
    username: options.username,
    temporaryPassword: options.temporaryPassword,
    force: true,
    nowIso: options.nowIso,
  })
}
