import { google } from 'googleapis'
import { Readable } from 'stream'

export function getDriveClient() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!)
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive'],
  })
  return google.drive({ version: 'v3', auth })
}

export async function uploadFileToDrive(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
  folderId: string
): Promise<{ fileId: string; fileName: string }> {
  const drive = getDriveClient()
  const response = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: Readable.from(fileBuffer),
    },
    fields: 'id, name',
    supportsAllDrives: true,
  })
  return {
    fileId: response.data.id!,
    fileName: response.data.name!,
  }
}

export async function makeFilePublic(fileId: string): Promise<void> {
  const drive = getDriveClient()
  await drive.permissions.create({
    fileId,
    requestBody: { role: 'reader', type: 'anyone' },
    supportsAllDrives: true,
  })
}

export async function downloadFileFromDrive(fileId: string): Promise<Buffer> {
  const drive = getDriveClient()
  const response = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'arraybuffer' }
  )
  return Buffer.from(response.data as ArrayBuffer)
}

// Moves the file to the Drive trash (restorable for 30 days) rather than deleting it permanently
export async function trashDriveFile(fileId: string): Promise<void> {
  const drive = getDriveClient()
  await drive.files.update({ fileId, requestBody: { trashed: true }, supportsAllDrives: true })
}

// Best-effort cleanup (e.g. a rejected submission's CV): moves the file to the trash, logs failures, never throws
export async function trashDriveFileQuietly(fileId: string | null | undefined, context: string): Promise<void> {
  if (!fileId) return
  try {
    await trashDriveFile(fileId)
  } catch (err) {
    console.error(`[${context}] Failed to move Drive file ${fileId} to trash:`, err)
  }
}

// Read-only Sheets client on the same service account (redeployment roster)
export function getSheetsClient() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!)
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  })
  return google.sheets({ version: 'v4', auth })
}

export type DriveFolderFile = { id: string; name: string; mimeType: string }

// All non-trashed files directly in a folder (works for Shared Drives)
export async function listDriveFolderFiles(folderId: string): Promise<DriveFolderFile[]> {
  const drive = getDriveClient()
  const files: DriveFolderFile[] = []
  let pageToken: string | undefined
  do {
    const res = await drive.files.list({
      q: `'${folderId.replace(/'/g, "\\'")}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id, name, mimeType)',
      pageSize: 1000,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    })
    for (const f of res.data.files ?? []) {
      if (f.id && f.name) files.push({ id: f.id, name: f.name, mimeType: f.mimeType ?? '' })
    }
    pageToken = res.data.nextPageToken ?? undefined
  } while (pageToken)
  return files
}

// Name and type of a Drive file (Shared Drives supported)
export async function getDriveFileMeta(fileId: string): Promise<{ name: string; mimeType: string; size: number | null }> {
  const drive = getDriveClient()
  const res = await drive.files.get({ fileId, fields: 'name, mimeType, size', supportsAllDrives: true })
  return { name: res.data.name ?? 'cv', mimeType: res.data.mimeType ?? 'application/octet-stream', size: res.data.size != null ? Number(res.data.size) : null }
}
