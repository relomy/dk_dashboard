interface D1Like {
  prepare: D1Database['prepare']
}

export interface AuditRecordWrite {
  id: string
  actorUserId: string | null
  action: string
  targetUserId: string | null
  metadataJson: string | null
  ipHash: string | null
  userAgent: string | null
  createdAt: string
}

export async function writeAuditEvent(db: D1Like, record: AuditRecordWrite): Promise<void> {
  await db
    .prepare(
      `INSERT INTO auth_audit_log (
        id, actor_user_id, action, target_user_id, metadata_json, ip_hash, user_agent, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      record.id,
      record.actorUserId,
      record.action,
      record.targetUserId,
      record.metadataJson,
      record.ipHash,
      record.userAgent,
      record.createdAt,
    )
    .run()
}
