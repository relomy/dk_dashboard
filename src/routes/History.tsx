import { useParams } from 'react-router-dom'
import { parseHistoryTimestamp } from '../lib/time'

function History() {
  const { timestamp } = useParams()

  return (
    <section>
      <h1>History</h1>
      <p>{timestamp ? `Selected timestamp: ${parseHistoryTimestamp(timestamp)}` : 'Select a timestamp.'}</p>
    </section>
  )
}

export default History
