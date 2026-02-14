import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import KeyGate from '../components/KeyGate'
import LatestOverview from '../components/LatestOverview'
import { useProfiles } from '../context/ProfileContext'
import { useHistorySnapshot } from '../hooks/useHistorySnapshot'
import { clearKey, getStoredKey, getStoredMode, storeKey, type StorageMode } from '../lib/accessKey'

function History() {
  const queryClient = useQueryClient()
  const { activeProfile } = useProfiles()
  const { timestamp: timestampParam } = useParams()
  const [apiKey, setApiKey] = useState('')

  useEffect(() => {
    setApiKey(getStoredKey())
  }, [])

  const { timestamp, manifestPath, manifestQuery, snapshotQuery, snapshotNotFound } = useHistorySnapshot(
    apiKey,
    timestampParam,
  )

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

  if (!timestampParam) {
    return (
      <section>
        <h1>History</h1>
        <p>Select a timestamp.</p>
      </section>
    )
  }

  if (!apiKey) {
    return <KeyGate onSave={handleSaveKey} />
  }

  if (manifestQuery.isLoading || snapshotQuery.isLoading) {
    return <p>Loading historical snapshot...</p>
  }

  if (manifestQuery.error || snapshotQuery.error) {
    const message =
      manifestQuery.error instanceof Error
        ? manifestQuery.error.message
        : snapshotQuery.error instanceof Error
          ? snapshotQuery.error.message
          : 'Unable to load historical snapshot.'

    return (
      <section>
        <h1>History</h1>
        <p className="error-text">{message}</p>
        <button type="button" onClick={handleChangeKey}>
          Change key
        </button>
      </section>
    )
  }

  if (snapshotNotFound) {
    return (
      <section>
        <h1>History</h1>
        <p>Snapshot not found for {timestamp}.</p>
        <p>Manifest checked: {manifestPath}</p>
      </section>
    )
  }

  if (!snapshotQuery.data) {
    return <p>Snapshot not available.</p>
  }

  return (
    <section>
      <div className="inline-actions">
        <button type="button" onClick={() => snapshotQuery.refetch()}>
          Refresh
        </button>
        <button type="button" onClick={handleChangeKey}>
          Change key ({getStoredMode()})
        </button>
      </div>
      <LatestOverview
        snapshot={snapshotQuery.data}
        vipFilterMode="all"
        activeProfileRules={activeProfile.rules}
      />
    </section>
  )
}

export default History
