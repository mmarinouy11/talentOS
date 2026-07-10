// Save as test-drive.mjs in your talentOS project root, then run: node test-drive.mjs
import { readFileSync } from 'fs'
import { createSign } from 'crypto'

// Load .env.local manually (no dependency needed)
const envContent = readFileSync('.env.local', 'utf-8')
const envVars = {}
for (const line of envContent.split('\n')) {
  const idx = line.indexOf('=')
  if (idx === -1) continue
  const key = line.slice(0, idx).trim()
  const value = line.slice(idx + 1).trim()
  envVars[key] = value
}

const credentials = JSON.parse(envVars.GOOGLE_SERVICE_ACCOUNT_KEY)
const folderId = envVars.GOOGLE_DRIVE_FOLDER_ID

console.log('Service account:', credentials.client_email)
console.log('Folder ID:', folderId)

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function getAccessToken(scope) {
  const header = { alg: 'RS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const claimSet = {
    iss: credentials.client_email,
    scope,
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }
  const encodedHeader = base64url(JSON.stringify(header))
  const encodedClaim = base64url(JSON.stringify(claimSet))
  const signInput = `${encodedHeader}.${encodedClaim}`

  const sign = createSign('RSA-SHA256')
  sign.update(signInput)
  sign.end()
  const signature = sign.sign(credentials.private_key)
  const encodedSignature = signature.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

  const jwt = `${signInput}.${encodedSignature}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })
  const data = await res.json()
  if (!data.access_token) {
    console.error('Failed to get access token:', data)
    throw new Error('No access token')
  }
  return data.access_token
}

async function testScope(scopeName, scopeUrl) {
  console.log(`\n=== Testing with scope: ${scopeName} ===`)
  const token = await getAccessToken(scopeUrl)
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${folderId}?fields=id,name,mimeType,owners,driveId&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  const data = await res.json()
  console.log('Status:', res.status)
  console.log('Response:', JSON.stringify(data, null, 2))
}

async function main() {
  await testScope('drive.file', 'https://www.googleapis.com/auth/drive.file')
  await testScope('drive (full)', 'https://www.googleapis.com/auth/drive')
}

main().catch(console.error)
