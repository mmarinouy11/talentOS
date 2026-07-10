import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import { SettingsNav } from '@/components/app/SettingsNav'
import { EmailTemplatesEditor } from '@/components/app/EmailTemplatesEditor'

export const SYSTEM_EMAIL_TEMPLATES = [
  {
    key: 'TEMPLATE_VENDOR_ASSIGNED',
    name: 'Vendor Assigned to Position',
    description: 'Sent to vendor contact when they are assigned to a position.',
    placeholders: ['vendorContactName', 'positionTitle', 'client', 'portalLink'],
  },
  {
    key: 'TEMPLATE_VENDOR_REMOVED',
    name: 'Vendor Removed from Position',
    description: 'Sent to vendor contact when they are removed from a position.',
    placeholders: ['vendorContactName', 'positionTitle', 'client'],
  },
  {
    key: 'TEMPLATE_POSITION_CLOSED',
    name: 'Position Closed',
    description: 'Sent to assigned vendors when a position is deleted/closed.',
    placeholders: ['vendorContactName', 'positionTitle', 'client'],
  },
  {
    key: 'TEMPLATE_FEEDBACK_INVITE',
    name: 'Interviewer Feedback Invite',
    description: 'Sent to interviewers with a magic link to submit feedback.',
    placeholders: ['candidateName', 'positionTitle', 'interviewType', 'link', 'recruiterName'],
  },
  {
    key: 'TEMPLATE_FEEDBACK_NOTIFICATION',
    name: 'Feedback Submitted Notification',
    description: 'Sent to recruiter when an interviewer submits feedback.',
    placeholders: ['recruiterName', 'candidateName', 'positionTitle', 'interviewType', 'link'],
  },
  {
    key: 'TEMPLATE_USER_INVITATION',
    name: 'User Invitation',
    description: 'Sent to new users to set their password.',
    placeholders: ['userName', 'inviteLink'],
  },
  {
    key: 'TEMPLATE_VENDOR_CANDIDATE_SUBMITTED',
    name: 'Vendor Candidate Submitted',
    description: 'Sent to recruiter when a vendor submits a new candidate.',
    placeholders: ['recruiterName', 'candidateName', 'positionTitle', 'vendorName', 'link'],
  },
] as const

export default async function EmailTemplatesPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if ((session.user as { role?: string }).role !== 'ADMIN') redirect('/positions')

  const overrides = await db.systemEmailTemplate.findMany({ orderBy: { key: 'asc' } })
  const overrideMap = Object.fromEntries(overrides.map((t) => [t.key, t]))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">Global platform configuration</p>
      </div>
      <SettingsNav />
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-1">Email Templates</h2>
        <p className="text-sm text-gray-500 mb-4">
          Override the default system email templates. Leave blank to use the built-in defaults.
          Use <code className="bg-gray-100 px-1 rounded text-xs">{`{{placeholderName}}`}</code> for dynamic values.
        </p>
        <EmailTemplatesEditor
          templates={SYSTEM_EMAIL_TEMPLATES.map((t) => ({
            ...t,
            override: overrideMap[t.key]
              ? { subject: overrideMap[t.key].subject, htmlBody: overrideMap[t.key].htmlBody, updatedAt: overrideMap[t.key].updatedAt.toISOString() }
              : null,
          }))}
        />
      </div>
    </div>
  )
}
