'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function PositionDeleteButton({ positionId, positionTitle }: { positionId: string; positionTitle: string }) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (!confirm(`Delete position '${positionTitle}'? This will hide it from all views. This action can be reversed by an administrator if needed.`)) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/positions/${positionId}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        alert(body.error ?? 'Delete failed')
        return
      }
      router.push('/positions')
    } catch {
      alert('Delete failed — please try again')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={deleting}
      className="px-3 py-1.5 rounded-lg border border-red-200 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
    >
      {deleting ? 'Deleting…' : 'Delete Position'}
    </button>
  )
}
