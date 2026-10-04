// PROTOTYPE — throwaway. Tiny shared atoms (not layout).
import { cn } from '@/lib/utils'
import type { GamePhase } from './liveModel'

export function PhaseDot({ phase, className }: { phase: GamePhase; className?: string }) {
  return (
    <span className={cn('relative inline-flex size-2 shrink-0', className)}>
      {phase === 'live' ? <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" /> : null}
      <span
        className={cn(
          'relative inline-flex size-2 rounded-full',
          phase === 'live' && 'bg-emerald-400',
          phase === 'pre' && 'bg-sky-400/70',
          phase === 'final' && 'bg-zinc-500',
        )}
      />
    </span>
  )
}

export function initials(name: string) {
  return name.replace(/[^a-zA-Z]/g, '').slice(0, 2).toUpperCase()
}

const VIP_COLORS = ['bg-violet-500', 'bg-amber-500', 'bg-cyan-500', 'bg-rose-500', 'bg-lime-500', 'bg-indigo-500']
export function vipColor(index: number) {
  return VIP_COLORS[index % VIP_COLORS.length]
}
