import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { importJobs } from '@/lib/import-jobs'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { jobId } = await params
  const job = importJobs.get(jobId)

  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  return NextResponse.json({
    total: job.total,
    completed: job.completed,
    done: job.done,
    error: job.error,
    // Only send results when done to avoid large partial payloads
    results: job.done ? job.results : [],
  })
}
