import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useProfiles } from '../context/ProfileContext'
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
      <h2 className="section-title">Profiles</h2>
      <ul className="list-panel">
        {profiles.map((profile) => (
          <li key={profile.id} className="item-card page-stack-sm">
            <p>
              <strong>{profile.name}</strong>
              {profile.id === activeProfileId ? ' (active)' : ''}
            </p>
            <p className="meta-text">contains: {profile.rules.contains ?? '-'}</p>
            <p className="meta-text">exact: {profile.rules.exact ?? '-'}</p>
            <p className="meta-text">username: {profile.rules.username ?? '-'}</p>
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

      <h2 className="section-title">{editingProfile ? `Edit profile: ${editingProfile.name}` : 'Add profile'}</h2>
      <form onSubmit={onSubmit} className="panel form-grid">
        <label htmlFor="profile-name">Profile name</label>
        <input
          id="profile-name"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />

        <label htmlFor="rule-contains">Match rule: contains</label>
        <input
          id="rule-contains"
          type="text"
          value={contains}
          onChange={(event) => setContains(event.target.value)}
        />

        <label htmlFor="rule-exact">Match rule: exact</label>
        <input id="rule-exact" type="text" value={exact} onChange={(event) => setExact(event.target.value)} />

        <label htmlFor="rule-username">Match rule: username</label>
        <input
          id="rule-username"
          type="text"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />

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
