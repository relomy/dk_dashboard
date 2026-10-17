import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { TimelineView } from '../../hooks/useTimelineView'
import type { LiveModel } from '../../lib/liveModel'
import { ALL_KINDS, KIND_LABEL } from '../../lib/timelineFilter'
import { vipName } from './shiftText'

function Chip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button type="button" variant={pressed ? 'secondary' : 'outline'} size="sm" aria-pressed={pressed} onClick={onClick} className={cn('shrink-0', pressed && 'border-ring')}>
      {children}
    </Button>
  )
}

/**
 * The always-visible filter bar: a VIP strip (left out with a single followed VIP), a kind strip, High priority only
 * and Compact. Each strip scrolls sideways so the bar fits 375px.
 */
export function TimelineFilterBar({ view, model, username }: { view: TimelineView; model: LiveModel; username: string | undefined }) {
  const { filters } = view
  return (
    <div role="group" aria-label="Timeline filters" className="space-y-1.5">
      {view.followed.size === 1 ? null : (
        <div role="group" aria-label="VIPs" className="flex gap-1.5 overflow-x-auto pb-1">
          {model.vips.map((vip) => (
            <Chip key={vip.key} pressed={filters.vips.has(vip.key)} onClick={() => view.toggleVip(vip.key)}>
              {vipName(model, vip.key, username)}
            </Chip>
          ))}
        </div>
      )}
      <div role="group" aria-label="Kinds" className="flex gap-1.5 overflow-x-auto pb-1">
        {ALL_KINDS.map((kind) => (
          <Chip key={kind} pressed={filters.kinds.has(kind)} onClick={() => view.toggleKind(kind)}>
            {KIND_LABEL[kind]}
          </Chip>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Chip pressed={filters.highOnly} onClick={() => view.setHighOnly(!filters.highOnly)}>
          High priority only
        </Chip>
        <Chip pressed={view.compact} onClick={() => view.setCompact(!view.compact)}>
          Compact
        </Chip>
      </div>
    </div>
  )
}
