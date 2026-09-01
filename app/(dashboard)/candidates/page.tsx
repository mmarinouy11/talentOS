import Link from 'next/link'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { CandidatesDashboard } from '@/components/app/CandidatesDashboard'

export default async function CandidatesPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const candidates = await db.candidate.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      country: true,
      seniority: true,
      skills: true,
      createdAt: true,
      sourcedByType: true,
      sourcedByOther: true,
      sourcedByUser: { select: { name: true, email: true } },
      sourcedByVendor: { select: { id: true, name: true } },
      candidatePositions: {
        select: { stage: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  // Compute stats
  let active = 0, hired = 0, rejected = 0
  for (const c of candidates) {
    const stages = c.candidatePositions.map((cp) => cp.stage)
    const hasHired = stages.includes('HIRED')
    const hasActive = stages.some((s) => s !== 'HIRED' && s !== 'REJECTED')
    if (hasHired) hired++
    else if (stages.length === 0 || hasActive) active++
    else rejected++
  }

  const serialized = candidates.map((c) => {
    const stages = c.candidatePositions.map((cp) => cp.stage)
    const hasHired = stages.includes('HIRED')
    const hasActive = stages.some((s) => s !== 'HIRED' && s !== 'REJECTED')
    const candidateStatus: 'active' | 'hired' | 'rejected' =
      hasHired ? 'hired' : (stages.length === 0 || hasActive) ? 'active' : 'rejected'
    return {
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      phone: c.phone,
      country: c.country,
      seniority: c.seniority,
      skills: c.skills,
      createdAt: c.createdAt.toISOString(),
      _count: { candidatePositions: c.candidatePositions.filter((cp) => cp.stage !== 'HIRED' && cp.stage !== 'REJECTED').length },
      sourcedByType: c.sourcedByType,
      sourcedByOther: c.sourcedByOther,
      sourcedByUser: c.sourcedByUser,
      sourcedByVendor: c.sourcedByVendor,
      candidateStatus,
    }
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Candidates</h1>
          <p className="text-sm text-gray-500 mt-0.5">{candidates.length} total candidates</p>
        </div>
        <div className="flex gap-2">
          <Link href="/candidates/import">
            <Button variant="outline">Import from LinkedIn</Button>
          </Link>
          <Link href="/candidates/new">
            <Button>New Candidate</Button>
          </Link>
        </div>
      </div>

      <CandidatesDashboard
        candidates={serialized}
        counts={{ total: candidates.length, active, hired, rejected }}
      />
    </div>
  )
}
