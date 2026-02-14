import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import KeyGate from '../components/KeyGate'
import LatestOverview from '../components/LatestOverview'
import { useLatest } from '../hooks/useLatest'
import { clearKey, getStoredKey, getStoredMode, storeKey, type StorageMode } from '../lib/accessKey'

function Latest() {
  const queryClient = useQueryClient()
  const [apiKey, setApiKey] = useState('')

  useEffect(() => {
    setApiKey(getStoredKey())
  }, [])

  const { latestQuery, snapshotQuery } = useLatest(apiKey)

  const handleSaveKey = (key: string, mode: StorageMode) => {
    storeKey(key, mode)
    setApiKey(key)
    queryClient.clear()
  }

  const handleChangeKey = () => {
    clearKey()
    setApiKey('')
    queryClient.clear()
  }

  if (!apiKey) {
    return <KeyGate onSave={handleSaveKey} />
  }

  if (latestQuery.isLoading || snapshotQuery.isLoading) {
    return <p>Loading latest snapshot...</p>
  }

  if (latestQuery.error || snapshotQuery.error) {
    const message =
      latestQuery.error instanceof Error
        ? latestQuery.error.message
        : snapshotQuery.error instanceof Error
          ? snapshotQuery.error.message
          : 'Unable to load latest snapshot.'

    return (
      <section>
        <h1>Latest</h1>
        <p className="error-text">{message}</p>
        <button type="button" onClick={handleChangeKey}>
          Change key
        </button>
      </section>
    )
  }

  if (!snapshotQuery.data) {
    return <p>Snapshot not available.</p>
  }

  return (
    <section>
      <div className="inline-actions">
        <button type="button" onClick={() => latestQuery.refetch()}>
          Refresh
        </button>
        <button type="button" onClick={handleChangeKey}>
          Change key ({getStoredMode()})
        </button>
      </div>
      <LatestOverview snapshot={snapshotQuery.data} />
    </section>
  )
}

export default Latest
