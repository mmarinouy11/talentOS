import Link from 'next/link'

export function GmailReminderBanner() {
  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-sm text-amber-800 flex items-center justify-center gap-2">
      <span>
        Gmail connection required — connect your Gmail to send candidate emails (no other sending method is available){' '}
        <Link href="/profile" className="font-semibold underline hover:text-amber-900">
          connect now
        </Link>
      </span>
    </div>
  )
}
