import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import KeyGate from '../components/KeyGate'
import { useSportSnapshot } from '../hooks/useSportSnapshot'
import { clearKey, getStoredKey, getStoredMode, storeKey, type StorageMode } from '../lib/accessKey'

function Live() {
  const queryClient = useQueryClient()
  const { sport } = useParams()
  const [apiKey, setApiKey] = useState('')

  useEffect(() => {
    setApiKey(getStoredKey())
  }, [])

  const { snapshot, loading, error, usingCache } = useSportSnapshot(apiKey)

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

  if (!sport) {
    return <p className="page">Sport not specified.</p>
  }

  const sportKey = sport.toLowerCase()

  if (!usingCache && !apiKey) {
    return <KeyGate onSave={handleSaveKey} />
  }

  if (loading) {
    return <p className="page">Loading live snapshot...</p>
  }

  if (error instanceof Error) {
    return (
      <section className="page page-stack">
        <h1 className="page-title">Live: {sport.toUpperCase()}</h1>
        <p className="error-text">{error.message}</p>
        <button type="button" onClick={handleChangeKey}>
          Change key
        </button>
      </section>
    )
  }

  if (!snapshot) {
    return <p className="page">Snapshot not available.</p>
  }

  const sportData = snapshot.sports[sportKey]

  if (!sportData) {
    return (
      <section className="page page-stack">
        <h1 className="page-title">Live: {sport.toUpperCase()}</h1>
        <p>Sport not found in snapshot.</p>
      </section>
    )
  }

  const primaryContest = sportData.primary_contest
    ? sportData.contests.find((contest) => contest.contest_key === sportData.primary_contest?.contest_key) ??
      sportData.contests.find((contest) => contest.contest_id === sportData.primary_contest?.contest_id) ??
      null
    : null

  if (!sportData.primary_contest) {
    return (
      <section className="page page-stack">
        <h1 className="page-title">Live: {sport.toUpperCase()}</h1>
        <p>Primary contest is not configured for this sport.</p>
        <p className="meta-text">Use /sport/{sportKey} for the broader multi-contest view.</p>
      </section>
    )
  }

  if (!primaryContest) {
    return (
      <section className="page page-stack">
        <h1 className="page-title">Live: {sport.toUpperCase()}</h1>
        <p>Primary contest data is missing from this snapshot.</p>
        <p className="meta-text">Configured key: {sportData.primary_contest.contest_key}</p>
        <p className="meta-text">Configured id: {sportData.primary_contest.contest_id}</p>
      </section>
    )
  }

  return (
    <section className="page page-stack">
      <div className="action-row">
        <button type="button" onClick={handleChangeKey}>
          Change key ({getStoredMode()})
        </button>
      </div>

      <h1 className="page-title">Live: {sport.toUpperCase()}</h1>
      <p className="page-meta">Snapshot at: {new Date(snapshot.snapshot_at).toLocaleString()}</p>

      <div className="panel page-stack-sm">
        <h2 className="section-title">Primary contest</h2>
        <p className="meta-text">{primaryContest.name}</p>
        <p className="meta-text">Contest key: {primaryContest.contest_key}</p>
        <p className="meta-text">Contest id: {primaryContest.contest_id}</p>
        <p className="meta-text">Selection reason: {sportData.primary_contest.selection_reason}</p>
      </div>

      <div className="panel page-stack-sm">
        <h2 className="section-title">VIP board</h2>
        <p className="meta-text">Data unavailable: section implementation starts in the next commit.</p>
      </div>

      <div className="panel page-stack-sm">
        <h2 className="section-title">Ownership remaining</h2>
        <p className="meta-text">Data unavailable: section implementation starts in the next commit.</p>
      </div>

      <div className="panel page-stack-sm">
        <h2 className="section-title">Train finder</h2>
        <p className="meta-text">Data unavailable: section implementation starts in the next commit.</p>
      </div>

      <div className="panel page-stack-sm">
        <h2 className="section-title">Standings</h2>
        <p className="meta-text">Data unavailable: section implementation starts in the next commit.</p>
      </div>
    </section>
  )
}

export default Live
