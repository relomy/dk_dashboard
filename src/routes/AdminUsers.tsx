import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  createAdminUser,
  deactivateAdminUser,
  listAdminUsers,
  reactivateAdminUser,
  resetAdminUserPassword,
} from '../lib/authApi'
import { useAuth } from '../hooks/useAuth'
import type { AdminUser, AuthRole } from '../lib/types'

function sortUsers(users: AdminUser[]): AdminUser[] {
  return [...users].sort((a, b) => a.username.localeCompare(b.username))
}

function AdminUsers() {
  const { user } = useAuth()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [username, setUsername] = useState('')
  const [role, setRole] = useState<AuthRole>('friend')
  const [tempPassword, setTempPassword] = useState('')
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const result = await listAdminUsers()
        if (!cancelled) {
          setUsers(sortUsers(result))
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load users.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const statusMessage = useMemo(() => {
    if (generatedPassword) {
      return `Temporary password: ${generatedPassword}`
    }
    return null
  }, [generatedPassword])

  if (user?.role !== 'owner') {
    return (
      <div className="mx-auto grid w-full max-w-5xl gap-4 p-4 sm:p-6">
        <h1 className="font-heading text-lg font-semibold tracking-tight">Admin users</h1>
        <p role="alert" className="text-sm text-destructive">
          Owner access required.
        </p>
      </div>
    )
  }

  const submitCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!username.trim()) {
      return
    }
    setError(null)
    setGeneratedPassword(null)

    try {
      const result = await createAdminUser({
        username: username.trim(),
        role,
        temporaryPassword: tempPassword.trim() ? tempPassword.trim() : undefined,
      })
      setUsers((prev) => sortUsers([...prev, result.user]))
      setGeneratedPassword(result.temporaryPassword || null)
      setUsername('')
      setTempPassword('')
      setRole('friend')
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Unable to create user.')
    }
  }

  const onResetPassword = async (target: AdminUser) => {
    setError(null)
    setGeneratedPassword(null)
    try {
      const result = await resetAdminUserPassword(target.id)
      setUsers((prev) =>
        sortUsers(
          prev.map((item) =>
            item.id === target.id
              ? {
                  ...item,
                  must_change_password: true,
                }
              : item,
          ),
        ),
      )
      setGeneratedPassword(result.temporaryPassword || null)
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : 'Unable to reset password.')
    }
  }

  const onDeactivate = async (target: AdminUser) => {
    setError(null)
    try {
      await deactivateAdminUser(target.id)
      setUsers((prev) =>
        sortUsers(prev.map((item) => (item.id === target.id ? { ...item, is_active: false } : item))),
      )
    } catch (deactivateError) {
      setError(deactivateError instanceof Error ? deactivateError.message : 'Unable to deactivate user.')
    }
  }

  const onReactivate = async (target: AdminUser) => {
    setError(null)
    try {
      await reactivateAdminUser(target.id)
      setUsers((prev) =>
        sortUsers(prev.map((item) => (item.id === target.id ? { ...item, is_active: true } : item))),
      )
    } catch (reactivateError) {
      setError(reactivateError instanceof Error ? reactivateError.message : 'Unable to reactivate user.')
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-4 p-4 sm:p-6">
      <div className="grid gap-1">
        <h1 className="font-heading text-lg font-semibold tracking-tight">Admin users</h1>
        <p className="text-xs text-muted-foreground">Create, reset, deactivate, and reactivate dashboard users.</p>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {statusMessage ? (
        <p
          role="status"
          className="rounded-lg border border-cash-line/40 bg-cash-line-muted px-3 py-2 font-mono text-sm break-all"
        >
          {statusMessage}
        </p>
      ) : null}

      <Card size="sm">
        <form onSubmit={submitCreate} className="grid gap-4">
          <CardHeader>
            <CardTitle>
              <h2>Create user</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <Label htmlFor="admin-create-username">Username</Label>
                <Input
                  id="admin-create-username"
                  type="text"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="admin-create-role">Role</Label>
                <NativeSelect
                  id="admin-create-role"
                  value={role}
                  onChange={(event) => setRole(event.target.value as AuthRole)}
                >
                  <option value="friend">friend</option>
                  <option value="owner">owner</option>
                </NativeSelect>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="admin-create-temp-password">Temporary password (optional)</Label>
                <Input
                  id="admin-create-temp-password"
                  type="text"
                  value={tempPassword}
                  onChange={(event) => setTempPassword(event.target.value)}
                  placeholder="Auto-generate if empty"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit">Create user</Button>
            </div>
          </CardContent>
        </form>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>
            <h2>Users</h2>
          </CardTitle>
          {loading || users.length === 0 ? (
            <CardDescription className="text-xs">{loading ? 'Loading users...' : 'No users found.'}</CardDescription>
          ) : null}
        </CardHeader>
        {loading || users.length === 0 ? null : (
          <CardContent>
            <Table className="text-xs">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-muted-foreground">Username</TableHead>
                  <TableHead className="text-muted-foreground max-sm:hidden">Role</TableHead>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                  <TableHead className="text-muted-foreground max-sm:hidden">Must change</TableHead>
                  <TableHead className="text-muted-foreground max-sm:hidden">Last login</TableHead>
                  <TableHead className="text-muted-foreground">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      {item.username}
                      <span className="block font-normal text-muted-foreground sm:hidden">{item.role}</span>
                    </TableCell>
                    <TableCell className="max-sm:hidden">{item.role}</TableCell>
                    <TableCell>
                      <Badge variant={item.is_active ? 'secondary' : 'outline'}>
                        {item.is_active ? 'active' : 'inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-sm:hidden">{item.must_change_password ? 'yes' : 'no'}</TableCell>
                    <TableCell className="font-mono text-muted-foreground max-sm:hidden">{item.last_login_at ?? '—'}</TableCell>
                    <TableCell className="whitespace-normal">
                      <div className="flex flex-wrap gap-1.5">
                        <Button type="button" variant="outline" size="sm" onClick={() => void onResetPassword(item)}>
                          Reset password
                        </Button>
                        {item.is_active ? (
                          <Button type="button" variant="destructive" size="sm" onClick={() => void onDeactivate(item)}>
                            Deactivate
                          </Button>
                        ) : (
                          <Button type="button" variant="secondary" size="sm" onClick={() => void onReactivate(item)}>
                            Reactivate
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        )}
      </Card>
    </div>
  )
}

export default AdminUsers
