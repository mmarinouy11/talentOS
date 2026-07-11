import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import { SettingsNav } from '@/components/app/SettingsNav'
import { EmailTemplatesEditor } from '@/components/app/EmailTemplatesEditor'

export const SYSTEM_EMAIL_TEMPLATES = [
  {
    key: 'TEMPLATE_VENDOR_ASSIGNED',
    name: 'Partner Assigned to Position',
    description: 'Sent to partner contact when they are assigned to a position.',
    placeholders: ['vendorContactName', 'positionTitle', 'client', 'portalLink'] as const,
    defaultSubject: 'New position available: {{positionTitle}}',
    defaultHtml: `<p>Hi {{vendorContactName}},</p>\n<p>You've been granted access to submit candidates for a new position: <strong>{{positionTitle}}</strong>.</p>\n<p><a href="{{portalLink}}" style="display:inline-block;background-color:#000000;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:500;">View Position &amp; Submit Candidates</a></p>\n<p>Best,<br/>Tenarai LATAM</p>`,
  },
  {
    key: 'TEMPLATE_VENDOR_REMOVED',
    name: 'Partner Removed from Position',
    description: 'Sent to partner contact when they are removed from a position.',
    placeholders: ['vendorContactName', 'positionTitle', 'client'] as const,
    defaultSubject: 'Position update: {{positionTitle}}',
    defaultHtml: `<p>Hi {{vendorContactName}},</p>\n<p>You have been removed from the sourcing list for <strong>{{positionTitle}}</strong>. Please stop submitting candidates for this position.</p>\n<p>Best,<br/>Tenarai LATAM</p>`,
  },
  {
    key: 'TEMPLATE_POSITION_CLOSED',
    name: 'Position Closed',
    description: 'Sent to assigned partners when a position is deleted/closed.',
    placeholders: ['vendorContactName', 'positionTitle', 'client'] as const,
    defaultSubject: 'Position update: {{positionTitle}}',
    defaultHtml: `<p>Hi {{vendorContactName}},</p>\n<p>The <strong>{{positionTitle}}</strong> position has been closed and is no longer accepting submissions.</p>\n<p>Thank you for your partnership.</p>\n<p>Best,<br/>Tenarai LATAM</p>`,
  },
  {
    key: 'TEMPLATE_FEEDBACK_INVITE',
    name: 'Interviewer Feedback Invite',
    description: 'Sent to interviewers with a magic link to submit feedback.',
    placeholders: ['candidateName', 'positionTitle', 'interviewType', 'link', 'recruiterName'] as const,
    defaultSubject: 'Feedback requested: {{candidateName}} — {{interviewType}}',
    defaultHtml: `<p>Hi,</p>\n<p>You recently interviewed <strong>{{candidateName}}</strong> for the <strong>{{positionTitle}}</strong> role ({{interviewType}}).</p>\n<p>Please submit your feedback using the link below:</p>\n<p><a href="{{link}}" style="display:inline-block;background-color:#000000;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:500;">Submit Feedback</a></p>\n<p>Best,<br/>{{recruiterName}}</p>`,
  },
  {
    key: 'TEMPLATE_FEEDBACK_NOTIFICATION',
    name: 'Feedback Submitted Notification',
    description: 'Sent to recruiter when an interviewer submits feedback.',
    placeholders: ['recruiterName', 'candidateName', 'positionTitle', 'interviewType', 'link'] as const,
    defaultSubject: 'Feedback received: {{candidateName}} — {{interviewType}}',
    defaultHtml: `<p>Hi {{recruiterName}},</p>\n<p>Feedback has been submitted for <strong>{{candidateName}}</strong> ({{interviewType}}) for the <strong>{{positionTitle}}</strong> role.</p>\n<p><a href="{{link}}" style="display:inline-block;background-color:#000000;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:500;">View Feedback</a></p>\n<p>Best,<br/>Tenarai LATAM</p>`,
  },
  {
    key: 'TEMPLATE_USER_INVITATION',
    name: 'User Invitation',
    description: 'Sent to new users to set their password.',
    placeholders: ['userName', 'inviteLink'] as const,
    defaultSubject: "You've been invited to Tenarai TalentOS",
    defaultHtml: `<p>Hi {{userName}},</p>\n<p>You've been invited to join Tenarai TalentOS. Click the link below to set your password and get started:</p>\n<p><a href="{{inviteLink}}" style="display:inline-block;background-color:#000000;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:500;">Set Password</a></p>\n<p>Best,<br/>Tenarai LATAM</p>`,
  },
  {
    key: 'TEMPLATE_VENDOR_CANDIDATE_SUBMITTED',
    name: 'Partner Candidate Submitted',
    description: 'Sent to recruiter when a partner submits a new candidate.',
    placeholders: ['recruiterName', 'candidateName', 'positionTitle', 'vendorName', 'link'] as const,
    defaultSubject: 'New candidate from {{vendorName}}: {{candidateName}} - {{positionTitle}}',
    defaultHtml: `<p>Hi {{recruiterName}},</p>\n<p><strong>{{vendorName}}</strong> has submitted a new candidate, <strong>{{candidateName}}</strong>, for <strong>{{positionTitle}}</strong>.</p>\n<p><a href="{{link}}" style="display:inline-block;background-color:#000000;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:500;">View Candidate</a></p>\n<p>Best,<br/>Tenarai LATAM</p>`,
  },
]

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
            defaultSubject: t.defaultSubject,
            defaultHtml: t.defaultHtml,
          }))}
        />
      </div>
    </div>
  )
}
