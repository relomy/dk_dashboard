import { Navigate } from 'react-router-dom'
import PageMessage from '../components/PageMessage'
import { useSportSnapshot } from '../hooks/useSportSnapshot'
import { chooseLandingSport, readLastViewedSport } from '../lib/landing'

/** The home page: sends the visitor to the Live view for the sport they should see first. */
function Landing() {
  const { snapshot, loading, error } = useSportSnapshot()

  if (loading) {
    return <PageMessage>Loading live snapshot...</PageMessage>
  }

  if (error instanceof Error) {
    return <PageMessage tone="error">{error.message}</PageMessage>
  }

  if (!snapshot) {
    return <PageMessage>Snapshot not available.</PageMessage>
  }

  const sport = chooseLandingSport(snapshot, readLastViewedSport())
  if (!sport) {
    return <PageMessage>No sports available in the latest snapshot.</PageMessage>
  }

  return <Navigate to={`/live/${sport}`} replace />
}

export default Landing
