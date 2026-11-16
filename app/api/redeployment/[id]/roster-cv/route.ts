import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/role-guard'
import { loadRosterCv } from '@/lib/redeployment-proposal'

// Download the roster CV with its original name (for the manual "Open in Gmail" fallback)
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await requireRole(['ADMIN', 'RECRUITER'])
  if (who instanceof NextResponse) return who
  const { id } = await params
  const profile = await db.redeploymentProfile.findUnique({ where: { id }, select: { sourceCvDriveFileId: true } })
  if (!profile?.sourceCvDriveFileId) return NextResponse.json({ error: 'No roster CV for this person' }, { status: 404 })
  try {
    const cv = await loadRosterCv(profile.sourceCvDriveFileId)
    return new NextResponse(new Uint8Array(cv.data), {
      headers: {
        'Content-Type': cv.mimeType,
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(cv.name)}`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error(`[redeployment] Roster CV download failed for profile ${id}:`, err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Could not download the roster CV' }, { status: 502 })
  }
}
