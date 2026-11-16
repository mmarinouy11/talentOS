import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { renderTenoraiCv, type CvExperienceEntry, type CvEducationEntry } from '@/lib/templates/tenarai-cv'
import { availabilityLabel } from '@/lib/start-availability'
import { fillCvExperienceFromDrive } from '@/lib/cv-experience'

// Parsing a scanned CV can take up to ~120 s (lib/cv-experience CV_PARSE_TIMEOUT_MS)
export const maxDuration = 180

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

function escHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// "Preparing CV…" shell: fetches the real CV (?render=1) and swaps it in, so slow parses show progress
function loadingPage(renderUrl: string) {
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Preparing CV… | Tenarai LATAM</title></head>
<body style="margin:0;background:#FFFFFF;font-family:Arial, Helvetica, sans-serif;color:#2F2C29;">
<div style="max-width:560px;margin:120px auto;text-align:center;">
<div style="width:28px;height:28px;margin:0 auto 16px auto;border:3px solid #E5E0D8;border-top-color:#8CF000;border-radius:50%;animation:s 0.9s linear infinite;"></div>
<p style="font-size:15px;margin:0;">Preparing CV…</p>
<p style="font-size:12px;color:#5E5751;margin:8px 0 0 0;">Reading the candidate's CV can take up to two minutes.</p>
</div>
<style>@keyframes s{to{transform:rotate(360deg)}}</style>
<script>
fetch(${JSON.stringify(renderUrl)}, { credentials: 'same-origin' })
  .then(function (r) { return r.text() })
  .then(function (html) { document.open(); document.write(html); document.close() })
  .catch(function () { document.body.innerHTML = '<p style="font-family:Arial;margin:80px auto;max-width:560px;">Could not load the CV. <a href="">Retry</a></p>' })
</script>
</body></html>`
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
}

// Experience could not be built: no silent fallback. Retry, or explicitly generate without experience.
function experienceErrorPage(reason: string, retryUrl: string, withoutUrl: string) {
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>CV not generated | Tenarai LATAM</title></head>
<body style="margin:0;background:#FFFFFF;font-family:Arial, Helvetica, sans-serif;color:#2F2C29;">
<div style="max-width:600px;margin:80px auto;padding:32px;border:1px solid #E5E0D8;border-radius:8px;">
<h1 style="font-size:20px;margin:0 0 12px 0;color:#000000;">Couldn't build the experience section</h1>
<p style="font-size:14px;line-height:1.6;margin:0 0 20px 0;">Reason: ${escHtml(reason)}</p>
<a href="${escHtml(retryUrl)}" style="display:inline-block;background:#2F2C29;color:#8CF000;font-weight:700;font-size:13px;padding:9px 16px;border-radius:4px;text-decoration:none;margin-right:10px;">Retry</a>
<a href="${escHtml(withoutUrl)}" style="display:inline-block;border:1px solid #2F2C29;color:#2F2C29;font-size:13px;padding:8px 16px;border-radius:4px;text-decoration:none;">Generate without experience</a>
<p style="font-size:12px;color:#5E5751;margin:16px 0 0 0;">"Generate without experience" shows "Detailed experience available upon request." in that section.</p>
</div></body></html>`
  return new NextResponse(html, { status: 422, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
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
  const withoutExperience = req.nextUrl.searchParams.get('withoutExperience') === '1'
  const base = `/api/candidate-positions/${id}/tenarai-cv`
  const qs = (render: boolean, without: boolean) => {
    const p = new URLSearchParams()
    if (render) p.set('render', '1')
    if (without) p.set('withoutExperience', '1')
    const s = p.toString()
    return s ? `${base}?${s}` : base
  }
  // First request: show "Preparing CV…" while the real render (which may parse the CV) runs
  if (req.nextUrl.searchParams.get('render') !== '1') return loadingPage(qs(true, withoutExperience))

  try {
    const cp = await db.candidatePosition.findFirst({
      where: { id },
      include: {
        candidate: {
          select: {
            id: true, firstName: true, lastName: true, country: true, summary: true,
            skills: true, languages: true, seniority: true, yearsOfExperience: true, startAvailability: true,
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

    // No stored work history: parse the stored CV now (fills only empty fields), then re-read.
    // If experience still can't be built, stop with the reason unless the user chose to go without it.
    if (experience.length === 0 && !withoutExperience) {
      const result = candidate.cvDriveId ? await fillCvExperienceFromDrive(candidate.id) : { status: 'no-cv' as const }
      if (result.status === 'filled') {
        const fresh = await db.candidate.findUnique({ where: { id: candidate.id }, select: { cvExperience: true, cvEducation: true, skills: true, summary: true } })
        experience = sanitizeExperience(fresh?.cvExperience)
        education = sanitizeEducation(fresh?.cvEducation)
        skills = strList(fresh?.skills)
        summary = str(fresh?.summary) || null
      }
      if (experience.length === 0) {
        const reason = result.status === 'failed' ? result.reason
          : result.status === 'no-cv' ? 'there is no CV file on this candidate'
            : 'no work experience was found in the CV'
        console.error(`[tenarai-cv] No experience for candidatePosition ${id} (candidate ${candidate.id}): ${reason}`)
        return experienceErrorPage(reason, qs(false, false), qs(false, true))
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
      availability: availabilityLabel(candidate.startAvailability),
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
