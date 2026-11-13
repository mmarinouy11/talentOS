import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/role-guard'
import { importGlobalOpportunities } from '@/lib/global-opportunity-import'
import { runRedeploymentMatching } from '@/lib/redeployment-matching'

export const maxDuration = 300
const MAX_BYTES = 30 * 1024 * 1024

export async function POST(request: Request) {
  const who = await requireRole(['ADMIN', 'RECRUITER'])
  if (who instanceof NextResponse) return who
  const form = await request.formData()
  const file = form.get('file')
  if (!file || typeof file === 'string') return NextResponse.json({ error: 'Choose the .xlsx file' }, { status: 400 })
  if (!file.name.toLowerCase().endsWith('.xlsx')) return NextResponse.json({ error: 'Only .xlsx files are supported' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File too large (max 30 MB)' }, { status: 400 })
  try {
    const summary = await importGlobalOpportunities(Buffer.from(await file.arrayBuffer()), file.name, who.id)
    // Matching runs in the background; unchanged pairs are skipped
    void runRedeploymentMatching().catch((err) => console.error('[global-opportunities] Matching after import failed:', err instanceof Error ? err.message : err))
    return NextResponse.json(summary)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Import failed'
    console.error('[global-opportunities] Import failed:', message)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
