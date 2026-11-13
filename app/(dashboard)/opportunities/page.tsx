import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { getActiveOpportunityGroups } from '@/lib/redeployment-matching'
import { OpportunitiesView, type OpportunityGroupRow } from '@/components/app/OpportunitiesView'
import { OpportunityImportForm } from '@/components/app/OpportunityImportForm'

export default async function OpportunitiesPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const role = (session.user as { role?: string }).role
  if (role !== 'ADMIN' && role !== 'RECRUITER') redirect('/')

  const [groups, lastImport] = await Promise.all([
    getActiveOpportunityGroups(),
    db.globalOpportunityImport.findFirst({ orderBy: { importedAt: 'desc' } }),
  ])
  const importer = lastImport ? await db.user.findUnique({ where: { id: lastImport.importedById }, select: { name: true, email: true } }) : null

  const rows: OpportunityGroupRow[] = groups
    .map((g) => ({
      groupKey: g.groupKey,
      designation: g.designation,
      account: g.accountName ?? g.groupAccountName,
      location: g.location,
      workMode: g.workMode,
      grade: g.grade,
      experience: g.experience,
      mandatorySkills: g.mandatorySkills,
      skillText: [g.primarySkill, ...g.subSkills, ...g.mandatorySkills].filter(Boolean).join(' ').toLowerCase(),
      openings: g.openings,
      requisitionIds: g.requisitionIds,
      plannedOnboarding: g.plannedOnboardingDate?.toISOString() ?? null,
      stage: g.stageName,
      confidence: g.confidenceLevel,
    }))
    .sort((a, b) => b.openings - a.openings || a.designation.localeCompare(b.designation))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Global opportunities</h1>
        <p className="text-sm text-gray-500 mt-0.5">Company-wide open positions (US hybrid/remote and extra locations), matched against the Redeployment pool.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-medium text-gray-900 mb-3">Last import</h2>
          {lastImport ? (
            <div className="space-y-2 text-sm">
              <p className="text-gray-600">
                {lastImport.fileName} · {lastImport.importedAt.toLocaleString('en-US', { timeZone: 'America/Montevideo', dateStyle: 'medium', timeStyle: 'short' })}
                {importer && <> · {importer.name ?? importer.email}</>}
              </p>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-1">
                {([
                  ['Rows read', lastImport.totalRows], ['Kept', lastImport.kept], ['New', lastImport.newCount], ['Deactivated', lastImport.deactivated],
                  ['Discarded · Offshore', lastImport.discardedOffshore], ['Discarded · LATAM', lastImport.discardedLatam],
                  ['Discarded · US work from office', lastImport.discardedUsWfo], ['Discarded · Other location', lastImport.discardedOtherLocation],
                  ['Discarded · Closed / no openings / other', lastImport.discardedOther],
                ] as const).map(([label, n]) => (
                  <div key={label} className="flex justify-between gap-2 border-b border-gray-100 py-0.5">
                    <dt className="text-gray-500">{label}</dt><dd className="font-medium text-[#2F2C29]">{n}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : <p className="text-sm text-gray-400">No import yet.</p>}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-medium text-gray-900 mb-3">Import open positions report</h2>
          <OpportunityImportForm />
        </div>
      </div>

      <OpportunitiesView rows={rows} />
    </div>
  )
}
