'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Role = 'ADMIN' | 'RECRUITER' | 'INTERVIEWER' | 'HIRING_MANAGER'

interface UserRow {
  id: string
  name: string | null
  email: string
  role: Role
  active: boolean
}

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Admin',
  RECRUITER: 'Recruiter',
  INTERVIEWER: 'Interviewer',
  HIRING_MANAGER: 'Hiring Manager',
}

const ROLES: Role[] = ['ADMIN', 'RECRUITER', 'INTERVIEWER', 'HIRING_MANAGER']

// ── Create / Edit modal ──────────────────────────────────────────────────────

interface UserFormProps {
  user?: UserRow
  onClose: () => void
  onSaved: (u: UserRow) => void
}

function UserForm({ user, onClose, onSaved }: UserFormProps) {
  const isEdit = !!user
  const [name, setName] = useState(user?.name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [role, setRole] = useState<Role>(user?.role ?? 'RECRUITER')
  const [active, setActive] = useState(user?.active ?? true)
  const [password, setPassword] = useState('')
  const [showReset, setShowReset] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)

    try {
      if (isEdit) {
        const body: Record<string, unknown> = { name, role, active }
        if (showReset && newPassword) body.newPassword = newPassword

        const res = await fetch(`/api/users/${user!.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const data = await res.json()
        if (!res.ok) { setError(data.error ?? 'Save failed'); return }
        onSaved(data)
      } else {
        const res = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, role, password }),
        })
        const data = await res.json()
        if (!res.ok) { setError(data.error ?? 'Create failed'); return }
        onSaved(data)
      }
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-5">
        <h2 className="text-lg font-semibold text-gray-900">
          {isEdit ? 'Edit User' : 'New User'}
        </h2>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="u-name">Name</Label>
            <Input
              id="u-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="u-email">Email</Label>
            <Input
              id="u-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isEdit}
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="u-role">Role</Label>
            <select
              id="u-role"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
          </div>

          {!isEdit && (
            <div>
              <Label htmlFor="u-password">Password</Label>
              <Input
                id="u-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="mt-1"
              />
            </div>
          )}

          {isEdit && (
            <div>
              <Label>Status</Label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  id="u-active"
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <label htmlFor="u-active" className="text-sm text-gray-700">Active</label>
              </div>
            </div>
          )}

          {isEdit && !showReset && (
            <button
              type="button"
              onClick={() => setShowReset(true)}
              className="text-sm text-blue-600 hover:underline"
            >
              Reset password
            </button>
          )}

          {isEdit && showReset && (
            <div>
              <Label htmlFor="u-newpw">New Password</Label>
              <Input
                id="u-newpw"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={6}
                placeholder="Leave blank to keep current"
                className="mt-1"
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create User'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

export function UsersManager({ initialUsers }: { initialUsers: UserRow[] }) {
  const [users, setUsers] = useState(initialUsers)
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState<UserRow | null>(null)

  function handleSaved(updated: UserRow) {
    setUsers((prev) => {
      const idx = prev.findIndex((u) => u.id === updated.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = updated
        return next
      }
      return [...prev, updated].sort((a, b) =>
        (a.name ?? a.email).localeCompare(b.name ?? b.email)
      )
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setShowCreate(true)}>New User</Button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-[2px] border-b-[#8DF000] bg-gray-50">
              <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Role</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-900">{u.name ?? '—'}</td>
                <td className="px-4 py-3 text-gray-600">{u.email}</td>
                <td className="px-4 py-3 text-gray-600">{ROLE_LABELS[u.role]}</td>
                <td className="px-4 py-3">
                  {u.active ? (
                    <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Active</span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">Inactive</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(u)}>Edit</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <UserForm
          onClose={() => setShowCreate(false)}
          onSaved={handleSaved}
        />
      )}
      {editing && (
        <UserForm
          user={editing}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
