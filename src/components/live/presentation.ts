import type { GameStatus } from '../../lib/liveModel'

export const GAME_STATUS_LABEL: Record<GameStatus, string> = {
  'pre-game': 'Pre-game',
  'in-progress': 'In progress',
  final: 'Final',
}

const VIP_COLORS = ['bg-vip-1', 'bg-vip-2', 'bg-vip-3', 'bg-vip-4', 'bg-vip-5', 'bg-vip-6'] as const

/** A VIP's identity color, stable per VIP by VIP order (the index into `LiveModel.vips`). */
export function vipColorClass(vipIndex: number): string {
  return VIP_COLORS[vipIndex % VIP_COLORS.length]
}

/** Up to two letters for a VIP avatar. */
export function vipInitials(name: string): string {
  return name.replace(/[^a-zA-Z]/g, '').slice(0, 2).toUpperCase() || '?'
}
