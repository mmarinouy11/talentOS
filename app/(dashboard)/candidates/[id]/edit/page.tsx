import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { CandidateForm } from '@/components/app/CandidateForm'

export default async function EditCandidatePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { id } = await params

  const candidate = await db.candidate.findFirst({
    where: { id, deletedAt: null },
  })

  if (!candidate) notFound()

  return (
    <div className="space-y-6">
      <div>
        <nav className="text-sm text-gray-500 mb-1">
          <Link href="/candidates" className="hover:text-gray-900">Candidates</Link>
          <span className="mx-2">›</span>
          <Link href={`/candidates/${id}`} className="hover:text-gray-900">
            {candidate.firstName} {candidate.lastName}
          </Link>
          <span className="mx-2">›</span>
          <span className="text-gray-900">Edit</span>
        </nav>
        <h1 className="text-2xl font-semibold text-gray-900">Edit Candidate</h1>
      </div>
      <CandidateForm
        mode="edit"
        defaultValues={{
          id: candidate.id,
          firstName: candidate.firstName,
          lastName: candidate.lastName,
          email: candidate.email,
          phone: candidate.phone,
          country: candidate.country,
          seniority: candidate.seniority,
          yearsOfExperience: candidate.yearsOfExperience,
          desiredCompensation: candidate.desiredCompensation,
          minimumCompensation: candidate.minimumCompensation,
          skills: candidate.skills,
          languages: candidate.languages,
        }}
      />
    </div>
  )
}
