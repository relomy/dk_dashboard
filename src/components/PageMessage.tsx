import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * A centered message for loading, errors and pages with nothing to show. An error is announced
 * as an alert, anything else as a status. `title` adds a visually hidden page heading.
 */
function PageMessage({ title, tone, children }: { title?: string; tone?: 'error'; children: ReactNode }) {
  return (
    <div className="grid min-h-64 place-items-center p-4">
      {title ? <h1 className="sr-only">{title}</h1> : null}
      <div
        role={tone === 'error' ? 'alert' : 'status'}
        className={cn(
          'max-w-md space-y-2 text-center text-sm',
          tone === 'error' ? 'text-non-cashing' : 'text-muted-foreground',
        )}
      >
        {children}
      </div>
    </div>
  )
}

export default PageMessage
