import type { ReactNode } from 'react'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'

/**
 * Full-page dark surface for the pages that render outside the app shell
 * (Login, Change password). It is its own `.app-ui` root, so the scoped reset
 * applies and `html:has(.app-ui)` paints the page behind it dark.
 */
function AuthLayout({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <div className="app-ui flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <span className="font-mono text-xs font-bold text-cashing">DK/LIVE</span>
          <h1 className="font-heading text-lg leading-snug font-semibold">{title}</h1>
          <CardDescription className="text-xs">{description}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  )
}

/** Dark placeholder shown by the auth pages while the session loads. */
export function AuthLoading() {
  return (
    <div role="status" className="app-ui grid min-h-dvh place-items-center text-sm text-muted-foreground">
      Loading session...
    </div>
  )
}

export default AuthLayout
