import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useProfiles } from '../context/ProfileContext'
import { useAuth } from '../hooks/useAuth'
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
  const { user, logout } = useAuth()

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
    <div className="app-ui">
      <div className="mx-auto grid w-full max-w-3xl gap-4 p-4 sm:p-6">
        <h1 className="font-heading text-lg font-semibold tracking-tight">Settings</h1>

        <Card size="sm">
          <CardHeader>
            <CardTitle>
              <h2>Account</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid gap-1 text-sm text-muted-foreground">
              <p>
                Signed in as: <strong className="font-medium text-foreground">{user?.username ?? 'unknown'}</strong>
              </p>
              <p>
                Role: <strong className="font-medium text-foreground">{user?.role ?? 'friend'}</strong>
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void logout()
                }}
              >
                Sign out
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle>
              <h2>Profiles</h2>
            </CardTitle>
            <CardDescription className="text-xs">
              Profiles define local matching rules for filtering VIP lineups. Active profile applies across views.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {profiles.length === 0 ? (
              <p className="text-sm text-muted-foreground">No profiles yet. Add one below.</p>
            ) : (
              <ul className="grid gap-2">
                {profiles.map((profile) => (
                  <li key={profile.id} className="grid gap-2 rounded-lg border bg-background/40 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">
                        <span>{profile.name}</span>
                        {profile.id === activeProfileId ? (
                          <span className="font-normal text-muted-foreground"> (active)</span>
                        ) : null}
                      </p>
                      <Badge variant={profile.id === activeProfileId ? 'secondary' : 'outline'}>
                        {profile.id === activeProfileId ? 'Active profile' : 'Saved profile'}
                      </Badge>
                    </div>
                    <p className="font-mono text-xs break-words text-muted-foreground">
                      contains: {profile.rules.contains ?? '-'} | exact: {profile.rules.exact ?? '-'} | username:{' '}
                      {profile.rules.username ?? '-'}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => setActiveProfileId(profile.id)}>
                        Set active
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => startEdit(profile.id)}>
                        Edit
                      </Button>
                      <Button type="button" variant="destructive" size="sm" onClick={() => deleteProfile(profile.id)}>
                        Delete
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card size="sm">
          <form onSubmit={onSubmit} className="grid gap-4">
            <CardHeader>
              <CardTitle>
                <h2>{editingProfile ? `Edit profile: ${editingProfile.name}` : 'Add profile'}</h2>
              </CardTitle>
              <CardDescription className="text-xs">
                {editingProfile
                  ? 'Update rules and save to apply changes.'
                  : 'Create a named local profile for VIP matching.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="profile-name">Profile name</Label>
                <Input
                  id="profile-name"
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="rule-contains">Match rule: contains</Label>
                  <Input
                    id="rule-contains"
                    type="text"
                    value={contains}
                    onChange={(event) => setContains(event.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="rule-exact">Match rule: exact</Label>
                  <Input id="rule-exact" type="text" value={exact} onChange={(event) => setExact(event.target.value)} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="rule-username">Match rule: username</Label>
                  <Input
                    id="rule-username"
                    type="text"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="submit">{editingProfile ? 'Save profile' : 'Add profile'}</Button>
                <Button type="button" variant="secondary" onClick={resetForm}>
                  Clear
                </Button>
              </div>
            </CardContent>
          </form>
        </Card>
      </div>
    </div>
  )
}

export default Settings
