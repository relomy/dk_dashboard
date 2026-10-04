import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import CommandCenter from '../components/live/CommandCenter'
import PageMessage from '../components/PageMessage'
import { useRememberSport } from '../hooks/useRememberSport'
import { useSportSnapshot } from '../hooks/useSportSnapshot'
import { buildLiveModel, type LiveNotRenderableReason } from '../lib/liveModel'

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
    return <PageMessage>No sport selected.</PageMessage>
  }

  const sportLabel = sport.toUpperCase()
  const title = `Live: ${sportLabel}`

  if (loading) {
    return <PageMessage>Loading live snapshot...</PageMessage>
  }

  if (error instanceof Error) {
    return (
      <PageMessage title={title} tone="error">
        <p>{error.message}</p>
      </PageMessage>
    )
  }

  if (!snapshot || !result) {
    return <PageMessage>Snapshot not available.</PageMessage>
  }

  if (result.kind === 'not-renderable') {
    return (
      <PageMessage title={title}>
        <NotRenderable reason={result.reason} sportKey={sportKey} sportLabel={sportLabel} />
      </PageMessage>
    )
  }

  return <CommandCenter model={result.model} title={title} />
}

export default Live
