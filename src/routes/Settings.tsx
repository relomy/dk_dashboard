import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useProfiles } from '../context/ProfileContext'
import { getStoredMode } from '../lib/accessKey'
import type { ProfileMatchRules } from '../lib/profiles'

function trimOptional(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function buildRules(input: { contains: string; exact: string; username: string }): ProfileMatchRules {
  return {
    contains: trimOptional(input.contains),
    exact: trimOptional(input.exact),
    username: trimOptional(input.username),
  }
}

function Settings() {
  const { profiles, activeProfileId, setActiveProfileId, addProfile, updateProfile, deleteProfile } = useProfiles()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [contains, setContains] = useState('')
  const [exact, setExact] = useState('')
  const [username, setUsername] = useState('')

  const editingProfile = useMemo(
    () => (editingId ? profiles.find((profile) => profile.id === editingId) ?? null : null),
    [editingId, profiles],
  )
  const storedMode = getStoredMode()

  const resetForm = () => {
    setEditingId(null)
    setName('')
    setContains('')
    setExact('')
    setUsername('')
  }

  const startEdit = (profileId: string) => {
    const profile = profiles.find((item) => item.id === profileId)
    if (!profile) {
      return
    }

    setEditingId(profile.id)
    setName(profile.name)
    setContains(profile.rules.contains ?? '')
    setExact(profile.rules.exact ?? '')
    setUsername(profile.rules.username ?? '')
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const trimmedName = name.trim()
    if (!trimmedName) {
      return
    }

    const rules = buildRules({ contains, exact, username })

    if (editingId) {
      updateProfile(editingId, { name: trimmedName, rules })
      resetForm()
      return
    }

    addProfile({ name: trimmedName, rules })
    resetForm()
  }

  return (
    <section className="page page-stack">
      <h1 className="page-title">Settings</h1>
      <div className="panel page-stack-sm">
        <h2 className="section-title">Access key</h2>
        <p className="meta-text">
          Key storage mode: <strong>{storedMode}</strong>
        </p>
        <p className="meta-text">Use Change key on data pages to replace or clear your saved key.</p>
      </div>

      <div className="panel page-stack">
        <div className="page-stack-sm">
          <h2 className="section-title">Profiles</h2>
          <p className="meta-text">
            Profiles define local matching rules for filtering VIP lineups. Active profile applies across views.
          </p>
        </div>
        {profiles.length === 0 ? (
          <p className="meta-text">No profiles yet. Add one below.</p>
        ) : (
          <ul className="list-panel">
            {profiles.map((profile) => (
              <li key={profile.id} className="item-card page-stack-sm settings-profile-item">
                <div className="settings-profile-header">
                  <p className="item-title">
                    <span>{profile.name}</span>
                    {profile.id === activeProfileId ? <span> (active)</span> : null}
                  </p>
                  <span className="meta-text">{profile.id === activeProfileId ? 'Active profile' : 'Saved profile'}</span>
                </div>
                <p className="meta-text settings-rule-line">
                  contains: {profile.rules.contains ?? '-'} | exact: {profile.rules.exact ?? '-'} | username:{' '}
                  {profile.rules.username ?? '-'}
                </p>
                <div className="action-row">
                  <button type="button" onClick={() => setActiveProfileId(profile.id)}>
                    Set active
                  </button>
                  <button type="button" onClick={() => startEdit(profile.id)}>
                    Edit
                  </button>
                  <button type="button" onClick={() => deleteProfile(profile.id)}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form onSubmit={onSubmit} className="panel page-stack">
        <div className="page-stack-sm">
          <h2 className="section-title">{editingProfile ? `Edit profile: ${editingProfile.name}` : 'Add profile'}</h2>
          <p className="meta-text">
            {editingProfile ? 'Update rules and save to apply changes.' : 'Create a named local profile for VIP matching.'}
          </p>
        </div>

        <div className="form-grid">
          <label htmlFor="profile-name">Profile name</label>
          <input
            id="profile-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </div>

        <div className="settings-rule-grid">
          <div className="form-grid">
            <label htmlFor="rule-contains">Match rule: contains</label>
            <input
              id="rule-contains"
              type="text"
              value={contains}
              onChange={(event) => setContains(event.target.value)}
            />
          </div>
          <div className="form-grid">
            <label htmlFor="rule-exact">Match rule: exact</label>
            <input id="rule-exact" type="text" value={exact} onChange={(event) => setExact(event.target.value)} />
          </div>
          <div className="form-grid">
            <label htmlFor="rule-username">Match rule: username</label>
            <input
              id="rule-username"
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </div>
        </div>

        <div className="action-row">
          <button type="submit">{editingProfile ? 'Save profile' : 'Add profile'}</button>
          <button type="button" onClick={resetForm}>
            Clear
          </button>
        </div>
      </form>
    </section>
  )
}

export default Settings
