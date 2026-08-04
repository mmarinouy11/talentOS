import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getFunnelData, getTimeToStage, getTimeInStage, getLeadTime } from '@/lib/analytics'
import { FunnelChart } from '@/components/app/FunnelChart'
import { VelocityTable } from '@/components/app/VelocityTable'
import { GlobalInsights } from '@/components/app/GlobalInsights'

export default async function ReportsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const isAdmin = (session.user as { role?: string }).role === 'ADMIN'

  const [funnel, timeToStage, timeInStage, leadTime] = await Promise.all([
    getFunnelData(),
    getTimeToStage(),
    getTimeInStage(),
    getLeadTime(),
  ])
  const globalInsights = await db.globalInsights.findFirst({ orderBy: { generatedAt: 'desc' } }).catch(() => null)

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Reports</h1>
          <p className="text-sm text-gray-500 mt-0.5">All-time · org-wide</p>
        </div>
        <Link
          href="/reports/account"
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6.75v6.75" />
          </svg>
          Account Status
        </Link>
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

      {isAdmin && (
        <div className="border-t border-gray-200 pt-6">
          <Link
            href="/reports/recruiters"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
            Recruiter Performance
          </Link>
        </div>
      )}
    </div>
  )
}
