import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import { SettingsForm } from '@/components/app/SettingsForm'
import { SettingsNav } from '@/components/app/SettingsNav'
import { EmailHeaderImageSection } from '@/components/app/EmailHeaderImageSection'
import { SystemGmailSection } from '@/components/app/SystemGmailSection'
import { PipelineReportDistributionSection } from '@/components/app/PipelineReportDistributionSection'

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ systemGmail?: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const user = session.user as { role?: string }
  if (user.role !== 'ADMIN') redirect('/positions')

  const { systemGmail } = await searchParams

  // Ensure new settings keys exist for existing deployments that predate the seed update
  await Promise.all([
    db.systemSettings.upsert({
      where: { key: 'VENDOR_MIN_FIT_SCORE' },
      update: {},
      create: { key: 'VENDOR_MIN_FIT_SCORE', value: '70', description: 'Minimum fit score (0–100) for vendor-submitted candidates. Submissions below this threshold are automatically rejected.' },
    }),
    db.systemSettings.upsert({
      where: { key: 'DIRECT_MIN_FIT_SCORE' },
      update: {},
      create: { key: 'DIRECT_MIN_FIT_SCORE', value: '30', description: 'Minimum fit score (0–100) for direct (portal) applications. Applications below this threshold are automatically rejected.' },
    }),
    db.systemSettings.upsert({
      where: { key: 'PIPELINE_REPORT_ENABLED' },
      update: {},
      create: { key: 'PIPELINE_REPORT_ENABLED', value: 'false', description: 'Enable daily pipeline report email' },
    }),
    db.systemSettings.upsert({
      where: { key: 'PIPELINE_REPORT_EMAILS' },
      update: {},
      create: { key: 'PIPELINE_REPORT_EMAILS', value: '[]', description: 'JSON array of recipient emails for the daily pipeline report' },
    }),
    db.systemSettings.upsert({
      where: { key: 'PIPELINE_REPORT_SEND_TIME' },
      update: {},
      create: { key: 'PIPELINE_REPORT_SEND_TIME', value: '22:00', description: 'Daily send time for pipeline report (HH:MM, GMT-3 Montevideo)' },
    }),
    db.systemSettings.upsert({
      where: { key: 'PIPELINE_REPORT_PERIOD_DAYS' },
      update: {},
      create: { key: 'PIPELINE_REPORT_PERIOD_DAYS', value: '7', description: 'Number of days of activity to include in the pipeline report' },
    }),
    db.systemSettings.upsert({
      where: { key: 'PIPELINE_REPORT_CADENCE' },
      update: {},
      create: { key: 'PIPELINE_REPORT_CADENCE', value: 'daily', description: 'Pipeline report cadence: daily | weekly | custom' },
    }),
    db.systemSettings.upsert({
      where: { key: 'PIPELINE_REPORT_WEEKLY_DAY' },
      update: {},
      create: { key: 'PIPELINE_REPORT_WEEKLY_DAY', value: '1', description: 'Day of week for weekly pipeline report (1=Mon … 5=Fri)' },
    }),
  ])

  const [settings, headerSetting, systemEmailAccount] = await Promise.all([
    db.systemSettings.findMany({ orderBy: { key: 'asc' } }),
    db.systemSettings.findUnique({ where: { key: 'EMAIL_HEADER_IMAGE_URL' } }),
    db.systemEmailAccount.findUnique({ where: { purpose: 'system_notifications' } }),
  ])
  const headerImageUrl = headerSetting?.value ?? ''

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">Global platform configuration</p>
      </div>
      <SettingsNav />
      <SettingsForm
        settings={settings.map((s) => ({
          id: s.id,
          key: s.key,
          value: s.value,
          description: s.description,
        }))}
      />
      <EmailHeaderImageSection currentUrl={headerImageUrl} />
      <PipelineReportDistributionSection
        enabled={settings.find((s) => s.key === 'PIPELINE_REPORT_ENABLED')?.value === 'true'}
        emails={JSON.parse(settings.find((s) => s.key === 'PIPELINE_REPORT_EMAILS')?.value ?? '[]')}
        sendTime={settings.find((s) => s.key === 'PIPELINE_REPORT_SEND_TIME')?.value ?? '22:00'}
        periodDays={Number(settings.find((s) => s.key === 'PIPELINE_REPORT_PERIOD_DAYS')?.value ?? '7')}
        cadence={(settings.find((s) => s.key === 'PIPELINE_REPORT_CADENCE')?.value ?? 'daily') as 'daily' | 'weekly' | 'custom'}
        weeklyDay={Number(settings.find((s) => s.key === 'PIPELINE_REPORT_WEEKLY_DAY')?.value ?? '1')}
      />
      <SystemGmailSection
        connectedEmail={systemEmailAccount?.connectedEmail ?? null}
        toast={systemGmail ?? null}
      />
    </div>
  )
}
