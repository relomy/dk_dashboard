import type { SportStatus } from '../lib/types'

const statusLabel: Record<SportStatus, string> = {
  ok: 'Fresh',
  stale: 'Stale',
  error: 'Error',
}

function StatusBadge({ status }: { status: SportStatus }) {
  return <span className={`status status-${status}`}>{statusLabel[status]}</span>
}

export default StatusBadge
