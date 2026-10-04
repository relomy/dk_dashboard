import { Navigate } from 'react-router-dom'
import { useSportSnapshot } from '../hooks/useSportSnapshot'
import { chooseLandingSport, readLastViewedSport } from '../lib/landing'

function Message({ children, tone }: { children: string; tone?: 'error' }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`app-ui grid min-h-64 place-items-center p-4 text-sm ${tone === 'error' ? 'text-non-cashing' : 'text-muted-foreground'}`}
    >
      {children}
    </div>
  )
}

/** The home page: sends the visitor to the Live view for the sport they should see first. */
function Landing() {
  const { snapshot, loading, error } = useSportSnapshot()

  if (loading) {
    return <Message>Loading live snapshot...</Message>
  }

  if (error instanceof Error) {
    return <Message tone="error">{error.message}</Message>
  }

  if (!snapshot) {
    return <Message>Snapshot not available.</Message>
  }

  const sport = chooseLandingSport(snapshot, readLastViewedSport())
  if (!sport) {
    return <Message>No sports available in the latest snapshot.</Message>
  }

  return <Navigate to={`/live/${sport}`} replace />
}

export default Landing
