import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import { getFunnelData, getTimeToStage, getTimeInStage, getLeadTime } from '@/lib/analytics'
import { FunnelChart } from '@/components/app/FunnelChart'
import { VelocityTable } from '@/components/app/VelocityTable'
import { GlobalInsights } from '@/components/app/GlobalInsights'

export default async function ReportsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const [funnel, timeToStage, timeInStage, leadTime] = await Promise.all([
    getFunnelData(),
    getTimeToStage(),
    getTimeInStage(),
    getLeadTime(),
  ])
  const globalInsights = await db.globalInsights.findFirst({ orderBy: { generatedAt: 'desc' } }).catch(() => null)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Reports</h1>
        <p className="text-sm text-gray-500 mt-0.5">All-time · org-wide</p>
      </div>

      {/* Pipeline Insights */}
      <GlobalInsights initial={globalInsights} />

      {/* Lead Time */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">Lead Time</h2>
        {leadTime.avgDays != null ? (
          <>
            <p className="text-5xl font-bold text-gray-900">
              {leadTime.avgDays}
              <span className="text-2xl font-normal text-gray-400 ml-1">d</span>
            </p>
            <p className="text-sm text-gray-500 mt-1">
              Average time from position open to filled / closed ({leadTime.sampleSize} position{leadTime.sampleSize !== 1 ? 's' : ''})
            </p>
          </>
        ) : (
          <p className="text-sm text-gray-400">Not enough data yet — no positions have been filled or closed.</p>
        )}
      </div>

      {/* Funnel */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-4">Candidate Funnel</h2>
        <FunnelChart data={funnel} size="large" />
      </div>

      {/* Velocity tables */}
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-4">Time to Stage</h2>
          <p className="text-xs text-gray-400 mb-3">Average days from APPLIED to first reaching each stage.</p>
          <VelocityTable data={timeToStage} label="Avg Days to Reach" />
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-4">Time in Stage</h2>
          <p className="text-xs text-gray-400 mb-3">Average days candidates spend in each stage before moving on.</p>
          <VelocityTable data={timeInStage} label="Avg Days in Stage" />
        </div>
      </div>
    </div>
  )
}
