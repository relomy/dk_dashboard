import { Navigate } from 'react-router-dom'
import PageMessage from '../components/PageMessage'
import { unsupportedSnapshotMessage, useLatestSnapshot } from '../hooks/useSnapshot'
import { chooseLandingSport, readLastViewedSport } from '../lib/landing'

/** The home page: sends the visitor to the Live view for the sport they should see first. */
function Landing() {
  const outcome = useLatestSnapshot()

  if (outcome.kind === 'loading') {
    return <PageMessage>Loading live snapshot...</PageMessage>
  }

  if (outcome.kind === 'error') {
    return <PageMessage tone="error">{outcome.error.message}</PageMessage>
  }

  if (outcome.kind === 'unsupported') return <PageMessage>{unsupportedSnapshotMessage(outcome.version)}</PageMessage>

  const { snapshot } = outcome
  const sport = chooseLandingSport(snapshot, readLastViewedSport())
  if (!sport) {
    return <PageMessage>No sports available in the latest snapshot.</PageMessage>
  }

  return <Navigate to={`/live/${sport}`} replace />
}

export default Landing
