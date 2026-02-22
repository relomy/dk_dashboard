interface D1Like {
  prepare: D1Database['prepare']
}

export interface UserWriteRecord {
  id: string
  username: string
  passwordHash: string
  role: 'owner' | 'friend'
  isActive: boolean
  mustChangePassword: boolean
  tempPasswordExpiresAt: string | null
  createdAt: string
  updatedAt: string
}

export interface UserRecord {
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

export interface SessionWriteRecord {
  id: string
  userId: string
  tokenHash: string
  expiresAt: string
  createdAt: string
  rotatedFromSessionId: string | null
  ipHash: string | null
  userAgent: string | null
}

async function run(db: D1Like, sql: string, args: unknown[]): Promise<void> {
  await db.prepare(sql).bind(...args).run()
}

async function all<T extends object>(db: D1Like, sql: string, args: unknown[]): Promise<T[]> {
  const result = await db.prepare(sql).bind(...args).all<T>()
  return result.results
}

async function first<T extends object>(db: D1Like, sql: string, args: unknown[]): Promise<T | null> {
  return db.prepare(sql).bind(...args).first<T>()
}

export async function createUser(db: D1Like, record: UserWriteRecord): Promise<void> {
  await run(
    db,
    `INSERT INTO users (
      id, username, password_hash, role, is_active, must_change_password, temp_password_expires_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.id,
      record.username,
      record.passwordHash,
      record.role,
      record.isActive ? 1 : 0,
      record.mustChangePassword ? 1 : 0,
      record.tempPasswordExpiresAt,
      record.createdAt,
      record.updatedAt,
    ],
  )
}

export async function findUserByUsername(db: D1Like, username: string): Promise<UserRecord | null> {
  return first<UserRecord>(db, 'SELECT * FROM users WHERE username = ?', [username])
}

export async function insertSession(db: D1Like, record: SessionWriteRecord): Promise<void> {
  await run(
    db,
    `INSERT INTO sessions (
      id, user_id, token_hash, expires_at, created_at, rotated_from_session_id, ip_hash, user_agent
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.id,
      record.userId,
      record.tokenHash,
      record.expiresAt,
      record.createdAt,
      record.rotatedFromSessionId,
      record.ipHash,
      record.userAgent,
    ],
  )
}

export async function revokeSessionById(db: D1Like, sessionId: string, revokedAt: string): Promise<void> {
  await run(db, 'UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL', [revokedAt, sessionId])
}

export async function revokeAllSessionsForUser(db: D1Like, userId: string, revokedAt: string): Promise<void> {
  await run(db, 'UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL', [revokedAt, userId])
}

export async function rotateSession(
  db: D1Like,
  params: {
    oldSessionId: string
    revokedAt: string
    nextSession: SessionWriteRecord
  },
): Promise<void> {
  await revokeSessionById(db, params.oldSessionId, params.revokedAt)
  await insertSession(db, params.nextSession)
}

export async function pruneSessionsToLimit(
  db: D1Like,
  userId: string,
  limit: number,
  revokedAt: string,
): Promise<number> {
  const rows = await all<{ id: string }>(
    db,
    `SELECT id
     FROM sessions
     WHERE user_id = ? AND revoked_at IS NULL
     ORDER BY created_at ASC`,
    [userId],
  )

  const overflow = rows.length - limit
  if (overflow <= 0) {
    return 0
  }

  const toRevoke = rows.slice(0, overflow)
  for (const row of toRevoke) {
    await revokeSessionById(db, row.id, revokedAt)
  }

  return toRevoke.length
}
