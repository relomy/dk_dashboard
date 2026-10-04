import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import AuthLayout, { AuthLoading } from '../components/AuthLayout'
import { AuthApiError } from '../lib/authApi'
import { useAuth } from '../hooks/useAuth'

function ChangePassword() {
  const navigate = useNavigate()
  const { status, user, changePassword, logout } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  if (status === 'loading') {
    return <AuthLoading />
  }

  if (status !== 'authenticated' || !user) {
    return <Navigate to="/login" replace />
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (newPassword.length < 12) {
      setError('New password must be at least 12 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      await changePassword(user.must_change_password ? undefined : currentPassword, newPassword)
      navigate('/', { replace: true })
    } catch (changeError) {
      if (changeError instanceof AuthApiError) {
        setError(changeError.message)
      } else {
        setError('Unable to change password.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <AuthLayout
      title="Change password"
      description={
        user.must_change_password
          ? 'Your temporary password must be changed before continuing.'
          : 'Update your password for this account.'
      }
    >
      <form onSubmit={submit} className="grid gap-4">
        {!user.must_change_password ? (
          <div className="grid gap-1.5">
            <Label htmlFor="current-password">Current password</Label>
            <Input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
        ) : null}

        <div className="grid gap-1.5">
          <Label htmlFor="new-password">New password</Label>
          <Input
            id="new-password"
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            autoComplete="new-password"
            minLength={12}
            required
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="confirm-password">Confirm new password</Label>
          <Input
            id="confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="new-password"
            minLength={12}
            required
          />
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="lg" disabled={saving}>
            {saving ? 'Saving...' : 'Save password'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => {
              void logout()
            }}
          >
            Sign out
          </Button>
        </div>
      </form>
    </AuthLayout>
  )
}

export default ChangePassword
