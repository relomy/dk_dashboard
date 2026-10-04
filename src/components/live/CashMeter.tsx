import { cn } from '@/lib/utils'
import type { LiveModel } from '../../lib/liveModel'
import { vipColorClass } from './presentation'

/**
 * Where every VIP sits in the field against the cash line: the paid ranks are tinted, the cash line is
 * labelled in amber, and the focused VIP's marker stands out. Rank is the axis, so it needs the cash line
 * rank and the field size; without them the meter says it is unavailable.
 */
function CashMeter({ model, focusedKey }: { model: LiveModel; focusedKey: string }) {
  const { fieldSize } = model
  const cashRank = model.cashLine.rank
  if (fieldSize === null || fieldSize < 2 || cashRank === null) {
    return <p className="mt-6 text-xs text-muted-foreground">Cash-line meter unavailable: the feed has no cash line rank.</p>
  }

  const position = (rank: number) => `${Math.min(100, Math.max(0, ((rank - 1) / (fieldSize - 1)) * 100))}%`
  const ranked = model.vips.flatMap((vip, index) => (vip.rank === null ? [] : [{ vip, index, rank: vip.rank }]))
  const label = `Cash line at rank ${cashRank} of ${fieldSize}. ${ranked.map(({ vip, rank }) => `${vip.name} #${rank}`).join(', ')}`

  return (
    <div className="mt-6">
      <div role="img" aria-label={label} className="relative h-3 overflow-hidden rounded-full bg-muted">
        <div className="absolute inset-y-0 left-0 bg-cashing/25" style={{ width: position(cashRank) }} />
        {ranked.map(({ vip, index, rank }) => (
          <div
            key={vip.key}
            className={cn(
              'absolute top-0 h-full w-1.5 -translate-x-1/2 rounded-full',
              vipColorClass(index),
              vip.key !== focusedKey && 'opacity-40',
            )}
            style={{ left: position(rank) }}
          />
        ))}
      </div>
      <div className="relative mt-1 flex justify-between font-mono text-[10px] text-muted-foreground">
        <span>#1</span>
        <span style={{ left: position(cashRank) }} className="absolute -translate-x-1/2 text-cash-line">
          {`cash ${cashRank}`}
        </span>
        <span>{`#${fieldSize}`}</span>
      </div>
    </div>
  )
}

export default CashMeter
