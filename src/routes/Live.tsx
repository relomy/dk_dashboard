import { useMemo, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import CommandCenter from '../components/live/CommandCenter'
import { useRememberSport } from '../hooks/useRememberSport'
import { useSportSnapshot } from '../hooks/useSportSnapshot'
import { buildLiveModel, type LiveNotRenderableReason } from '../lib/liveModel'

/** A centered message on the dark Live surface, for loading, errors and snapshots with nothing to render. */
function LiveMessage({ title, tone, children }: { title?: string; tone?: 'error'; children: ReactNode }) {
  return (
    <div className="grid min-h-64 place-items-center p-4">
      {title ? <h1 className="sr-only">{title}</h1> : null}
      <div
        role={tone === 'error' ? 'alert' : 'status'}
        className={`max-w-md space-y-2 text-center text-sm ${tone === 'error' ? 'text-non-cashing' : 'text-muted-foreground'}`}
      >
        {children}
      </div>
    </div>
  )
}

function AllContestsLink({ sportKey, sportLabel }: { sportKey: string; sportLabel: string }) {
  return (
    <p>
      <Link to={`/sport/${sportKey}`} className="text-foreground underline underline-offset-2">
        See all {sportLabel} contests
      </Link>
    </p>
  )
}

function NotRenderable({ reason, sportKey, sportLabel }: { reason: LiveNotRenderableReason; sportKey: string; sportLabel: string }) {
  switch (reason.kind) {
    case 'unsupported-schema':
      return (
        <p>
          This snapshot uses an unsupported format
          {reason.version === null ? '' : ` (version ${reason.version})`}, so it can't be shown.
        </p>
      )
    case 'sport-missing':
      return <p>This snapshot has no {sportLabel} data.</p>
    case 'no-primary-contest':
      return (
        <>
          <p>No primary contest is set for {sportLabel}, so there is nothing to follow live.</p>
          <AllContestsLink sportKey={sportKey} sportLabel={sportLabel} />
        </>
      )
    case 'primary-contest-missing':
      return (
        <>
          <p>The primary contest for {sportLabel} is not in this snapshot.</p>
          <AllContestsLink sportKey={sportKey} sportLabel={sportLabel} />
        </>
      )
  }
}

function Live() {
  const { sport } = useParams()
  const { snapshot, loading, error } = useSportSnapshot()

  const sportKey = sport?.toLowerCase()
  useRememberSport(sportKey)
  const result = useMemo(
    () => (snapshot && sportKey ? buildLiveModel(snapshot, sportKey) : null),
    [snapshot, sportKey],
  )

  if (!sport || !sportKey) {
    return <LiveMessage>No sport selected.</LiveMessage>
  }

  const sportLabel = sport.toUpperCase()
  const title = `Live: ${sportLabel}`

  if (loading) {
    return <LiveMessage>Loading live snapshot...</LiveMessage>
  }

  if (error instanceof Error) {
    return (
      <LiveMessage title={title} tone="error">
        <p>{error.message}</p>
      </LiveMessage>
    )
  }

  if (!snapshot || !result) {
    return <LiveMessage>Snapshot not available.</LiveMessage>
  }

  if (result.kind === 'not-renderable') {
    return (
      <LiveMessage title={title}>
        <NotRenderable reason={result.reason} sportKey={sportKey} sportLabel={sportLabel} />
      </LiveMessage>
    )
  }

  return <CommandCenter model={result.model} title={title} />
}

export default Live
