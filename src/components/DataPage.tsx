import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Root of a redesigned report page (History, Health, All contests). The outer
 * `.app-ui` element must stay a direct child of the shell's <main> so the shell
 * drops its legacy surface. When `title` is given it renders the page <h1> with
 * optional `actions` aligned to the right.
 */
function DataPage({
  title,
  actions,
  children,
  className,
}: {
  title?: ReactNode
  actions?: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <div className="app-ui">
      <div className={cn('mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4 text-sm', className)}>
        {title ? (
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
            {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
          </div>
        ) : null}
        {children}
      </div>
    </div>
  )
}

export default DataPage
