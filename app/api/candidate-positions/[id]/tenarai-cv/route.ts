import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { renderTenoraiCv, type CvExperienceEntry, type CvEducationEntry } from '@/lib/templates/tenarai-cv'

function normalizeSkill(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

const NO_EXPERIENCE_HTML = (candidateId: string) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Tenarai CV — Missing Experience</title>
<style>
  body { margin: 0; background: #000; color: #fff; font-family: Arial, Helvetica, sans-serif;
         display: flex; align-items: center; justify-content: center; min-height: 100vh; }
  .box { max-width: 480px; padding: 48px 40px; background: #1a1a1a; border-radius: 8px; }
  h1 { font-size: 18px; font-weight: 700; margin: 0 0 12px; color: #fff; }
  p { font-size: 14px; color: #8a8480; line-height: 1.6; margin: 0 0 24px; }
  a { color: #8CF000; text-decoration: none; font-weight: 600; }
  a:hover { text-decoration: underline; }
</style>
</head>
<body>
<div class="box">
  <h1>Experience data missing</h1>
  <p>Este candidato todavía no tiene el detalle de experiencia cargado. Volvé a la ficha del candidato y subí su CV para generar el CV Tenarai.</p>
  <a href="/candidates/${candidateId}/edit">→ Ir a la ficha del candidato</a>
</div>
</body>
</html>`

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 })

  const { id } = await params

  const cp = await db.candidatePosition.findFirst({
    where: { id },
    include: {
      candidate: {
        select: {
          id: true, firstName: true, lastName: true, summary: true,
          skills: true, languages: true, seniority: true, yearsOfExperience: true,
          cvExperience: true, cvEducation: true,
        },
      },
      position: {
        select: { title: true, client: true, jdSkills: true, coreSkills: true },
      },
    },
  })
  if (!cp) return new NextResponse('Not found', { status: 404 })

  const { candidate, position } = cp

  const experience: CvExperienceEntry[] = Array.isArray(candidate.cvExperience) && candidate.cvExperience.length > 0
    ? (candidate.cvExperience as unknown as CvExperienceEntry[])
    : []

  if (experience.length === 0) {
    return new NextResponse(NO_EXPERIENCE_HTML(candidate.id), {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    })
  }

  const anonymizedName = `${candidate.firstName} ${candidate.lastName.charAt(0).toUpperCase()}.`

  const positionSkillsNorm = [
    ...(position.coreSkills ?? []),
    ...(position.jdSkills ?? []),
  ].map(normalizeSkill)

  const matchingSkillSet = new Set(
    candidate.skills
      .filter((skill) => {
        const norm = normalizeSkill(skill)
        return positionSkillsNorm.some((ps) => ps.includes(norm) || norm.includes(ps))
      })
      .map((s) => s.toLowerCase())
  )

  const seniorityLabel = candidate.seniority
    ? candidate.seniority.charAt(0) + candidate.seniority.slice(1).toLowerCase()
    : null

  const education: CvEducationEntry[] = Array.isArray(candidate.cvEducation)
    ? (candidate.cvEducation as unknown as CvEducationEntry[])
    : []

  const html = renderTenoraiCv({
    anonymizedName,
    positionTitle: position.title,
    seniority: seniorityLabel,
    yearsOfExperience: candidate.yearsOfExperience,
    summary: candidate.summary,
    skills: candidate.skills,
    matchingSkillSet,
    languages: candidate.languages,
    experience,
    education,
  })

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
