import type { SportStatus } from './types'

export const statusLabel: Record<SportStatus, string> = {
  ok: 'Fresh',
  stale: 'Stale',
  error: 'Error',
}
