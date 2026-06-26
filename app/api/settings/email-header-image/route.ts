import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { uploadFileToDrive, makeFilePublic } from '@/lib/google'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as { role?: string }
  if (user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const formData = await req.formData()
  const file = formData.get('file')
  if (!file || typeof file === 'string') return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
  if (!allowed.includes((file as File).type)) return NextResponse.json({ error: 'Only image files are accepted' }, { status: 400 })
  if ((file as File).size > 5 * 1024 * 1024) return NextResponse.json({ error: 'File exceeds 5MB limit' }, { status: 400 })

  const arrayBuffer = await (file as File).arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID!
  const ext = (file as File).type.split('/')[1] ?? 'png'
  const fileName = `email_header_${Date.now()}.${ext}`

  const { fileId } = await uploadFileToDrive(buffer, fileName, (file as File).type, folderId)
  await makeFilePublic(fileId)
  const publicUrl = `https://drive.google.com/uc?export=view&id=${fileId}`

  await db.systemSettings.upsert({
    where: { key: 'EMAIL_HEADER_IMAGE_URL' },
    create: { key: 'EMAIL_HEADER_IMAGE_URL', value: publicUrl, description: 'URL of image shown at top of outgoing emails. Empty = no header image.' },
    update: { value: publicUrl },
  })

  return NextResponse.json({ url: publicUrl })
}

export async function DELETE() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as { role?: string }
  if (user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await db.systemSettings.upsert({
    where: { key: 'EMAIL_HEADER_IMAGE_URL' },
    create: { key: 'EMAIL_HEADER_IMAGE_URL', value: '', description: 'URL of image shown at top of outgoing emails. Empty = no header image.' },
    update: { value: '' },
  })

  return NextResponse.json({ ok: true })
}
