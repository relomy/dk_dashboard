import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import KeyGate from '../components/KeyGate'
import LatestOverview from '../components/LatestOverview'
import { useProfiles } from '../context/ProfileContext'
import { useLatest } from '../hooks/useLatest'
import { clearKey, getStoredKey, getStoredMode, storeKey, type StorageMode } from '../lib/accessKey'

function Latest() {
  const queryClient = useQueryClient()
  const { activeProfile } = useProfiles()
  const [apiKey, setApiKey] = useState('')
  const [vipFilterMode, setVipFilterMode] = useState<'all' | 'active'>('all')

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

  const handleRefresh = () => {
    latestQuery.refetch()
    snapshotQuery.refetch()
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
      <section className="page">
        <h1 className="page-title">Latest</h1>
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
    <section className="page page-stack">
      <div className="action-row">
        <button type="button" onClick={handleRefresh}>
          Refresh
        </button>
        <button type="button" onClick={handleChangeKey}>
          Change key ({getStoredMode()})
        </button>
      </div>
      <div className="panel field-inline">
        <label htmlFor="latest-vip-filter">VIP filter</label>
        <select
          id="latest-vip-filter"
          value={vipFilterMode}
          onChange={(event) => setVipFilterMode(event.target.value as 'all' | 'active')}
        >
          <option value="all">All VIPs</option>
          <option value="active">Active profile only</option>
        </select>
      </div>
      <LatestOverview
        snapshot={snapshotQuery.data}
        vipFilterMode={vipFilterMode}
        activeProfileRules={activeProfile.rules}
      />
    </section>
  )
}

export default Latest
