import { statusLabel } from '../lib/sportStatus'
import type { SportStatus } from '../lib/types'

function StatusBadge({ status }: { status: SportStatus }) {
  return <span className={`status status-${status}`}>{statusLabel[status]}</span>
}

export default StatusBadge
