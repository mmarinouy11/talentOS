import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { renderTenoraiCv, type CvExperienceEntry, type CvEducationEntry } from '@/lib/templates/tenarai-cv'
import { downloadFileFromDrive } from '@/lib/google'
import { parseCvFromBuffer } from '@/lib/cv-parser'

const PARSE_TIMEOUT_MS = 45_000
const PDF_MAGIC = '%PDF'

function normalizeSkill(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function str(v: unknown): string {
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number') return String(v)
  return ''
}

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.map(str).filter(Boolean) : []
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// cvExperience/cvEducation are Json columns written by Claude: coerce every field
function sanitizeExperience(v: unknown): CvExperienceEntry[] {
  if (!Array.isArray(v)) return []
  return v.filter(isObject)
    .map((e) => ({
      title: str(e.title),
      company: str(e.company),
      startDate: str(e.startDate),
      endDate: str(e.endDate),
      bullets: strList(e.bullets),
    }))
    .filter((e) => e.title || e.company || e.bullets.length > 0)
}

function sanitizeEducation(v: unknown): CvEducationEntry[] {
  if (!Array.isArray(v)) return []
  return v.filter(isObject)
    .map((e) => ({ degree: str(e.degree), institution: str(e.institution), year: str(e.year) || undefined }))
    .filter((e) => e.degree || e.institution)
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    p.then((v) => { clearTimeout(t); resolve(v) }, (e) => { clearTimeout(t); reject(e) })
  })
}

function escHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function errorPage(status: number, title: string, message: string) {
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escHtml(title)} | Tenarai LATAM</title></head>
<body style="margin:0;background:#FFFFFF;font-family:Arial, Helvetica, sans-serif;color:#2F2C29;">
<div style="max-width:560px;margin:80px auto;padding:32px;border:1px solid #E5E0D8;border-radius:8px;">
<h1 style="font-size:20px;margin:0 0 12px 0;color:#000000;">${escHtml(title)}</h1>
<p style="font-size:14px;line-height:1.6;margin:0 0 20px 0;">${escHtml(message)}</p>
<a href="javascript:history.back()" style="font-size:13px;color:#5E5751;">← Go back</a>
</div></body></html>`
  return new NextResponse(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return errorPage(401, 'Not signed in', 'Sign in to view this CV.')

  const { id } = await params

  try {
    const cp = await db.candidatePosition.findFirst({
      where: { id },
      include: {
        candidate: {
          select: {
            id: true, firstName: true, lastName: true, country: true, summary: true,
            skills: true, languages: true, seniority: true, yearsOfExperience: true,
            cvExperience: true, cvEducation: true, cvDriveId: true, deletedAt: true,
          },
        },
        position: {
          select: { title: true, client: true, jdSkills: true, coreSkills: true, deletedAt: true },
        },
      },
    })
    if (!cp || !cp.candidate || !cp.position) {
      return errorPage(404, 'CV not found', 'This candidate is no longer linked to this position.')
    }

    const { candidate, position } = cp
    if (candidate.deletedAt) {
      return errorPage(410, 'Candidate removed', 'This candidate was deleted or merged into another record, so the CV is not available from here.')
    }
    if (position.deletedAt) {
      return errorPage(410, 'Position removed', 'This position was deleted, so the CV is not available from here.')
    }

    let experience = sanitizeExperience(candidate.cvExperience)
    let education = sanitizeEducation(candidate.cvEducation)
    let skills = strList(candidate.skills)
    let summary = str(candidate.summary) || null

    if (experience.length === 0 && candidate.cvDriveId) {
      try {
        const buffer = await downloadFileFromDrive(candidate.cvDriveId)
        // .docx and other formats can't be parsed; the CV renders with what's on the candidate record
        if (buffer.subarray(0, 4).toString('latin1') !== PDF_MAGIC) {
          throw new Error(`Drive file ${candidate.cvDriveId} is not a PDF`)
        }
        const parsed = await withTimeout(parseCvFromBuffer(buffer), PARSE_TIMEOUT_MS, 'CV parse')

        const parsedSkills = strList(parsed?.skills)
        const existingLower = new Set(skills.map((s) => s.toLowerCase()))
        const newSkills = parsedSkills.filter((s) => !existingLower.has(s.toLowerCase()))
        const mergedSkills = newSkills.length > 0 ? [...skills, ...newSkills] : skills
        const parsedExperience = sanitizeExperience(parsed?.experience)
        const parsedEducation = sanitizeEducation(parsed?.education)
        const parsedSummary = str(parsed?.summary)

        const data: Record<string, unknown> = {}
        if (parsedExperience.length > 0) data.cvExperience = parsedExperience
        if (parsedEducation.length > 0) data.cvEducation = parsedEducation
        if (newSkills.length > 0) data.skills = mergedSkills
        if (!summary && parsedSummary) data.summary = parsedSummary

        if (Object.keys(data).length > 0) {
          db.candidate.update({ where: { id: candidate.id }, data }).catch((err) => {
            console.error(`[tenarai-cv] Failed to persist parsed CV for candidate ${candidate.id}:`, err)
          })
        }

        experience = parsedExperience
        if (parsedEducation.length > 0) education = parsedEducation
        skills = mergedSkills
        if (!summary && parsedSummary) summary = parsedSummary
      } catch (err) {
        // Missing/trashed file, non-PDF, Claude failure or timeout: fall back to the stored data
        console.error(`[tenarai-cv] On-demand parse failed for candidate ${candidate.id} (cvDriveId ${candidate.cvDriveId}):`, err)
      }
    }

    const firstName = str(candidate.firstName)
    const lastName = str(candidate.lastName)
    const anonymizedName = [firstName, lastName ? `${lastName.charAt(0).toUpperCase()}.` : ''].filter(Boolean).join(' ') || 'Candidate'

    const positionSkillsNorm = [...strList(position.coreSkills), ...strList(position.jdSkills)]
      .map(normalizeSkill)
      .filter(Boolean)

    const matchingSkillSet = new Set(
      skills
        .filter((skill) => {
          const norm = normalizeSkill(skill)
          return norm !== '' && positionSkillsNorm.some((ps) => ps.includes(norm) || norm.includes(ps))
        })
        .map((s) => s.toLowerCase())
    )

    const years = candidate.yearsOfExperience
    const html = renderTenoraiCv({
      anonymizedName,
      positionTitle: str(position.title) || 'Open position',
      country: str(candidate.country) || null,
      seniority: null,
      yearsOfExperience: typeof years === 'number' && Number.isFinite(years) && years > 0 ? years : null,
      summary,
      skills,
      matchingSkillSet,
      languages: strList(candidate.languages),
      experience,
      education,
    })

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error(`[tenarai-cv] Error: candidatePosition ${id}`, err)
    return errorPage(500, 'Could not generate the CV', `Something went wrong while building this CV (reference ${id}). Please try again, and contact an admin if it keeps failing.`)
  }
}
