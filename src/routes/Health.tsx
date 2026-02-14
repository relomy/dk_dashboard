import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import KeyGate from '../components/KeyGate'
import { useHealth } from '../hooks/useHealth'
import { clearKey, getStoredKey, getStoredMode, storeKey, type StorageMode } from '../lib/accessKey'

function Health() {
  const queryClient = useQueryClient()
  const [apiKey, setApiKey] = useState('')

  useEffect(() => {
    setApiKey(getStoredKey())
  }, [])

  const { latestQuery, snapshotQuery, snapshotAgeSeconds, sports } = useHealth(apiKey)

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
    return <p>Loading health data...</p>
  }

  if (latestQuery.error || snapshotQuery.error) {
    const message =
      latestQuery.error instanceof Error
        ? latestQuery.error.message
        : snapshotQuery.error instanceof Error
          ? snapshotQuery.error.message
          : 'Unable to load health data.'

    return (
      <section className="page page-stack">
        <h1 className="page-title">Health</h1>
        <p className="error-text">{message}</p>
        <button type="button" onClick={handleChangeKey}>
          Change key
        </button>
      </section>
    )
  }

  if (!snapshotQuery.data || !latestQuery.data) {
    return <p>Health data unavailable.</p>
  }

  return (
    <section className="page page-stack">
      <div className="action-row">
        <button type="button" onClick={() => snapshotQuery.refetch()}>
          Refresh
        </button>
        <button type="button" onClick={handleChangeKey}>
          Change key ({getStoredMode()})
        </button>
      </div>
      <h1 className="page-title">Health</h1>
      <div className="panel page-stack-sm">
        <p className="meta-text">Latest snapshot path: {latestQuery.data.latest_snapshot_path}</p>
        <p className="meta-text">Snapshot timestamp: {snapshotQuery.data.snapshot_at}</p>
        <p className="meta-text">Snapshot age: {snapshotAgeSeconds ?? 'unknown'} seconds</p>
      </div>

      <h2 className="section-title">Per-sport status</h2>
      <table className="data-table">
        <thead>
          <tr>
            <th>Sport</th>
            <th>Status</th>
            <th>Updated at</th>
            <th>Error</th>
          </tr>
        </thead>
        <tbody>
          {sports.map((item) => (
            <tr key={item.sport}>
              <td>{item.sport}</td>
              <td>{item.status}</td>
              <td>{item.updatedAt}</td>
              <td>{item.error ?? '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

export default Health
