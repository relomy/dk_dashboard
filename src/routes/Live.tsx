import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import CommandCenter from '../components/live/CommandCenter'
import PageMessage from '../components/PageMessage'
import { useRememberSport } from '../hooks/useRememberSport'
import { useLatestSnapshot } from '../hooks/useSnapshot'
import { unsupportedSnapshotMessage } from '../lib/interpretedSnapshot'
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
  const outcome = useLatestSnapshot()
  const snapshot = outcome.kind === 'ready' ? outcome.snapshot : null

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

  if (outcome.kind === 'loading') {
    return <PageMessage>Loading live snapshot...</PageMessage>
  }

  if (outcome.kind === 'error') {
    return (
      <PageMessage title={title} tone="error">
        <p>{outcome.error.message}</p>
      </PageMessage>
    )
  }

  if (outcome.kind === 'unsupported') {
    return <PageMessage title={title}>{unsupportedSnapshotMessage(outcome.version)}</PageMessage>
  }

  if (!result) {
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
