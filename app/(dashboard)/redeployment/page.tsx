import Link from 'next/link'
import { redirect } from 'next/navigation'
import { GlobalMatchesTab } from '@/components/app/GlobalMatchesTab'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { getLastSyncSummary } from '@/lib/redeployment-sync'
import { getAssignablePositionsForCandidates } from '@/lib/assignable-positions'
import { RedeploymentTable, type RedeploymentRow } from '@/components/app/RedeploymentTable'
import { RedeploymentSyncButton } from '@/components/app/RedeploymentSyncButton'

export default async function RedeploymentPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const role = (session.user as { role?: string }).role
  const isAdmin = role === 'ADMIN'
  const canAct = isAdmin || role === 'RECRUITER'
  const tab = (await searchParams).tab === 'matches' ? 'matches' : 'people'

  const [profiles, lastSync] = await Promise.all([
    db.redeploymentProfile.findMany({
      orderBy: [{ lwd: 'asc' }],
      include: {
        candidate: {
          select: {
            id: true, firstName: true, lastName: true, email: true, deletedAt: true,
            candidatePositions: {
              where: { status: 'ACTIVE', position: { deletedAt: null } },
              select: { id: true, stage: true, position: { select: { id: true, title: true, client: true } } },
            },
          },
        },
      },
    }),
    getLastSyncSummary(),
  ])

  const linkedIds = profiles.map((p) => p.candidateId).filter((x): x is string => !!x)
  const assignable = await getAssignablePositionsForCandidates(linkedIds)

  const dupIds = profiles.map((p) => p.possibleDuplicateOfId).filter((x): x is string => !!x)
  const dups = await db.candidate.findMany({ where: { id: { in: dupIds } }, select: { id: true, firstName: true, lastName: true, email: true } })
  const dupById = new Map(dups.map((d) => [d.id, d]))

  const rows: RedeploymentRow[] = profiles.map((p) => {
    const dup = p.possibleDuplicateOfId ? dupById.get(p.possibleDuplicateOfId) : undefined
    const candidate = p.candidate && !p.candidate.deletedAt ? p.candidate : null
    return {
      id: p.id,
      rosterId: p.rosterId,
      name: candidate
        ? `${candidate.firstName} ${candidate.lastName}`.trim()
        : [p.preferredName || p.firstName, p.lastName].filter(Boolean).join(' ') || p.rosterId,
      candidateId: candidate?.id ?? null,
      lastJobTitle: p.lastJobTitle,
      lastClient: p.lastClient,
      grade: p.grade,
      primarySkill: p.primarySkill,
      subSkill: p.subSkill,
      yearsExperience: p.yearsExperience,
      location: p.subLocation,
      lwd: p.lwd?.toISOString() ?? null,
      status: p.status,
      pipelines: candidate?.candidatePositions.map((cp) => ({ cpId: cp.id, positionId: cp.position.id, title: cp.position.title, client: cp.position.client, stage: cp.stage })) ?? [],
      rosterCvId: p.sourceCvDriveFileId,
      duplicateOf: !p.candidateId && dup ? { id: dup.id, name: `${dup.firstName} ${dup.lastName}`.trim(), email: dup.email } : null,
      assignable: candidate ? assignable.get(candidate.id) ?? [] : [],
      noEmail: !p.candidateId && !p.possibleDuplicateOfId && !p.personalEmail && !p.workEmail,
    }
  })

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Redeployment</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Delivery-center people released recently or about to be released, flagged for rehire.
          </p>
          <p className="text-xs text-gray-500 mt-2">
            {lastSync
              ? <>Last sync {new Date(lastSync.finishedAt).toLocaleString('en-US', { timeZone: 'America/Montevideo', dateStyle: 'medium', timeStyle: 'short' })} · {lastSync.created} created · {lastSync.linked} linked · {lastSync.pendingDecision} need a decision · {lastSync.updated} updated · {lastSync.outOfWindow} out of window · {lastSync.removed} removed · {lastSync.cvMissing} CV missing{(lastSync.invalidLwd ?? 0) > 0 && <> · {lastSync.invalidLwd} invalid LWD</>}{lastSync.errors.length > 0 && <span className="text-red-600"> · {lastSync.errors.length} error{lastSync.errors.length === 1 ? '' : 's'} (roster {lastSync.errors.slice(0, 5).map((e) => e.rosterId).join(', ')}{lastSync.errors.length > 5 ? '…' : ''}: {lastSync.errors[0].error})</span>}</>
              : 'Never synced'}
          </p>
        </div>
        {isAdmin && <RedeploymentSyncButton />}
      </div>
      <nav className="flex border-b border-gray-200">
        {([['people', 'People', '/redeployment'], ['matches', 'Matches', '/redeployment?tab=matches']] as const).map(([key, label, href]) => (
          <Link key={key} href={href} className={`py-2.5 mr-6 text-sm font-medium border-b-2 -mb-px ${tab === key ? 'border-[#8CF000] text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>{label}</Link>
        ))}
      </nav>
      {tab === 'people' ? <RedeploymentTable rows={rows} canAct={canAct} /> : <GlobalMatchesTab isAdmin={isAdmin} canAct={canAct} />}
    </div>
  )
}
