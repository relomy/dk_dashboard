import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import CommandCenter from '../components/live/CommandCenter'
import { useSportSnapshot } from '../hooks/useSportSnapshot'
import { buildLiveModel, type LiveNotRenderableReason } from '../lib/liveModel'

function NotRenderable({ reason, sportKey }: { reason: LiveNotRenderableReason; sportKey: string }) {
  switch (reason.kind) {
    case 'sport-missing':
      return <p>Sport not found in snapshot.</p>
    case 'no-primary-contest':
      return (
        <>
          <p>Primary contest is not configured for this sport.</p>
          <p className="meta-text">Use /sport/{sportKey} for the broader multi-contest view.</p>
        </>
      )
    case 'primary-contest-missing':
      return (
        <>
          <p>Primary contest data is missing from this snapshot.</p>
          <p className="meta-text">Configured key: {reason.contestKey}</p>
          <p className="meta-text">Configured id: {reason.contestId}</p>
        </>
      )
  }
}


function Live() {
  const { sport } = useParams()
  const { snapshot, loading, error } = useSportSnapshot()

  const sportKey = sport?.toLowerCase()
  const result = useMemo(
    () => (snapshot && sportKey ? buildLiveModel(snapshot, sportKey) : null),
    [snapshot, sportKey],
  )

  if (!sport || !sportKey) {
    return <p className="page">Sport not specified.</p>
  }

  if (loading) {
    return <p className="page">Loading live snapshot...</p>
  }

  if (error instanceof Error) {
    return (
      <section className="page page-stack">
        <h1 className="page-title">Live: {sport.toUpperCase()}</h1>
        <p className="error-text">{error.message}</p>
      </section>
    )
  }

  if (!snapshot || !result) {
    return <p className="page">Snapshot not available.</p>
  }

  if (result.kind === 'not-renderable') {
    return (
      <section className="page page-stack">
        <h1 className="page-title">Live: {sport.toUpperCase()}</h1>
        <NotRenderable reason={result.reason} sportKey={sportKey} />
      </section>
    )
  }

  return <CommandCenter model={result.model} title={`Live: ${sport.toUpperCase()}`} />
}

export default Live
