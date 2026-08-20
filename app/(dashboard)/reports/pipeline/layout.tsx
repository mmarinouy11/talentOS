import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import type { Role } from '@prisma/client'

export default async function PipelineReportLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if ((session.user as { role?: Role }).role !== 'ADMIN') redirect('/reports')
  return <>{children}</>
}
