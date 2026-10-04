import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { DASH } from '../../lib/format'
import type { GameStatus } from '../../lib/liveModel'
import { formatOwnership } from '../../lib/playerPool'
import { classifyValueTier, type ValueTier } from '../../lib/playerPresentation'
import type { ValueIcon } from '../../lib/types'
import { vipColorClass, vipInitials } from './presentation'

/** A small dot for a player's game status; it pulses while the game is in progress. */
export function GameStatusDot({ status, className }: { status: GameStatus | null; className?: string }) {
  if (!status) return null
  return (
    <span aria-hidden="true" className={cn('relative inline-flex size-2 shrink-0', className)}>
      {status === 'in-progress' ? (
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-game-in-progress opacity-60" />
      ) : null}
      <span
        className={cn(
          'relative inline-flex size-2 rounded-full',
          status === 'in-progress' && 'bg-game-in-progress',
          status === 'pre-game' && 'bg-game-pre-game/70',
          status === 'final' && 'bg-game-final',
        )}
      />
    </span>
  )
}

const OWN_STEPS = ['bg-own-1', 'bg-own-2', 'bg-own-3', 'bg-own-4', 'bg-own-5'] as const

function ownStep(own: number | null): string | undefined {
  if (own === null || own <= 0) return undefined
  return OWN_STEPS[Math.min(OWN_STEPS.length - 1, Math.floor(Math.min(own, 99.99) / 20))]
}

/** Ownership with an amber background whose intensity rises with ownership. */
export function OwnCell({ own }: { own: number | null }) {
  return (
    <span className={cn('block rounded px-2 py-1 text-right font-mono text-xs tabular-nums', ownStep(own))}>
      {formatOwnership(own)}
    </span>
  )
}

const VALUE_TONE: Record<Exclude<ValueTier, 'unknown'>, string> = {
  elite: 'bg-value-great-bg text-value-great',
  strong: 'bg-value-good-bg text-value-good',
  medium: 'bg-value-mid-bg text-value-mid',
  low: 'bg-value-poor-bg text-value-poor',
}

function formatValue(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

/** Value as a tier-colored pill; a dash when missing or hidden (pre-game). */
export function ValuePill({ value }: { value: number | null }) {
  const tier = classifyValueTier(value)
  if (value === null || tier === 'unknown') {
    return <span className="font-mono text-xs text-muted-foreground">{DASH}</span>
  }
  return (
    <span
      className={cn(
        'inline-block min-w-10 rounded px-1.5 py-0.5 text-center font-mono text-xs tabular-nums',
        VALUE_TONE[tier],
      )}
    >
      {formatValue(value)}
    </span>
  )
}

/** A team code on a hue derived from the code, so each team keeps its color. */
export function TeamChip({ team }: { team: string }) {
  let hue = 0
  for (const char of team) hue = (hue * 31 + char.charCodeAt(0)) % 360
  return (
    <span
      className="w-10 shrink-0 rounded-sm px-1 text-center font-mono text-[10px] font-bold text-white"
      style={{ backgroundColor: `hsl(${hue} 55% 35%)` }}
    >
      {team}
    </span>
  )
}

export interface AvatarVip {
  key: string
  name: string
  index: number
}

/** Overlapping VIP avatars; each links to that VIP. `small` renders plain dots without links. */
export function VipAvatars({
  vips,
  hrefFor,
  small,
}: {
  vips: AvatarVip[]
  hrefFor: (vip: AvatarVip) => string
  small?: boolean
}) {
  if (vips.length === 0) return null
  return (
    <span className="flex -space-x-1">
      {vips.map((vip) => {
        const className = cn(
          'grid shrink-0 place-items-center rounded-full font-bold text-white ring-2 ring-background',
          small ? 'size-3.5 text-[6px]' : 'size-5 text-[8px]',
          vipColorClass(vip.index),
        )
        return small ? (
          <span key={vip.key} title={vip.name} aria-hidden="true" className={className} />
        ) : (
          <Link key={vip.key} to={{ search: hrefFor(vip) }} title={vip.name} aria-label={vip.name} className={className}>
            {vipInitials(vip.name)}
          </Link>
        )
      })}
    </span>
  )
}

/** A VIP's initials on their identity color. */
export function VipAvatar({ name, index, className }: { name: string; index: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('grid shrink-0 place-items-center font-bold text-white', vipColorClass(index), className)}
    >
      {vipInitials(name)}
    </span>
  )
}

/** A labelled headline number, as the VIP and Train views lead with. */
export function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div role="group" aria-label={label}>
      <div className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase" aria-hidden="true">
        {label}
      </div>
      <div className={cn('font-mono text-2xl font-semibold tabular-nums', tone)}>{value}</div>
      {sub ? <div className="text-[11px] text-muted-foreground">{sub}</div> : null}
    </div>
  )
}

/** DraftKings' hot/cold marker, shown only when the feed provides one. */
export function ValueIconMark({ icon, className }: { icon: ValueIcon | null; className?: string }) {
  if (!icon) return null
  const label = icon === 'fire' ? 'Hot (DraftKings)' : 'Cold (DraftKings)'
  return (
    <span role="img" aria-label={label} title={label} className={cn('shrink-0', className)}>
      {icon === 'fire' ? '🔥' : '❄️'}
    </span>
  )
}
