import { useParams } from 'react-router-dom'

function Sport() {
  const { sport } = useParams()

  return <h1>Sport: {sport}</h1>
}

export default Sport
