import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { renderTenoraiCv, type CvExperienceEntry, type CvEducationEntry } from '@/lib/templates/tenarai-cv'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 })

  const { id } = await params

  const cp = await db.candidatePosition.findFirst({
    where: { id },
    include: {
      candidate: {
        select: {
          firstName: true, lastName: true, summary: true,
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

  const anonymizedName = `${candidate.firstName} ${candidate.lastName.charAt(0).toUpperCase()}.`

  const positionSkills = [
    ...(position.coreSkills ?? []),
    ...(position.jdSkills ?? []),
  ].map((s) => s.toLowerCase())

  const matchingSkillSet = new Set(
    candidate.skills
      .filter((skill) => positionSkills.some((ps) => ps.includes(skill.toLowerCase()) || skill.toLowerCase().includes(ps)))
      .map((s) => s.toLowerCase())
  )

  const seniorityLabel = candidate.seniority
    ? candidate.seniority.charAt(0) + candidate.seniority.slice(1).toLowerCase()
    : null

  const experience: CvExperienceEntry[] = Array.isArray(candidate.cvExperience)
    ? (candidate.cvExperience as unknown as CvExperienceEntry[])
    : []

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
