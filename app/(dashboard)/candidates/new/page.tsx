import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CandidateForm } from '@/components/app/CandidateForm'

export default async function NewCandidatePage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const currentUserId = (session.user as { id?: string }).id

  return (
    <div className="space-y-6">
      <div>
        <nav className="text-sm text-gray-500 mb-1">
          <Link href="/candidates" className="hover:text-gray-900">Candidates</Link>
          <span className="mx-2">›</span>
          <span className="text-gray-900">New Candidate</span>
        </nav>
        <h1 className="text-2xl font-semibold text-gray-900">New Candidate</h1>
      </div>
      <CandidateForm mode="create" currentUserId={currentUserId} />
    </div>
  )
}
