import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import type { SportStatus } from '../lib/types'
import { statusLabel } from '../lib/sportStatus'

const dotClass: Record<SportStatus, string> = {
  ok: 'bg-cashing',
  stale: 'bg-cash-line',
  error: 'bg-non-cashing',
}

export interface SportTab {
  sport: string
  status: SportStatus
}

function SportTabs({ tabs, currentSport }: { tabs: SportTab[]; currentSport: string | null }) {
  return (
    <nav
      aria-label="Sports"
      className="flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {tabs.map(({ sport, status }) => {
        const current = sport === currentSport
        return (
          <Link
            key={sport}
            to={`/live/${sport}`}
            aria-current={current ? 'page' : undefined}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 font-mono text-xs uppercase hover:text-foreground',
              current ? 'bg-secondary text-foreground' : 'text-muted-foreground',
            )}
          >
            {sport}
            <span aria-hidden="true" className={cn('inline-block size-1.5 rounded-full', dotClass[status])} />
            <span className="sr-only">{statusLabel[status]}</span>
          </Link>
        )
      })}
    </nav>
  )
}

export default SportTabs
