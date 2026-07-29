import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { renderTenoraiCv, type CvExperienceEntry, type CvEducationEntry } from '@/lib/templates/tenarai-cv'
import { downloadFileFromDrive } from '@/lib/google'
import { parseCvFromBuffer } from '@/lib/cv-parser'

function normalizeSkill(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 })

  const { id } = await params

  const cp = await db.candidatePosition.findFirst({
    where: { id },
    include: {
      candidate: {
        select: {
          id: true, firstName: true, lastName: true, country: true, summary: true,
          skills: true, languages: true, seniority: true, yearsOfExperience: true,
          cvExperience: true, cvEducation: true, cvDriveId: true,
        },
      },
      position: {
        select: { title: true, client: true, jdSkills: true, coreSkills: true },
      },
    },
  })
  if (!cp) return new NextResponse('Not found', { status: 404 })

  const { candidate, position } = cp

  let experience: CvExperienceEntry[] = Array.isArray(candidate.cvExperience) && candidate.cvExperience.length > 0
    ? (candidate.cvExperience as unknown as CvExperienceEntry[])
    : []
  let education: CvEducationEntry[] = Array.isArray(candidate.cvEducation)
    ? (candidate.cvEducation as unknown as CvEducationEntry[])
    : []
  let skills = candidate.skills
  let summary = candidate.summary

  if (experience.length === 0 && candidate.cvDriveId) {
    try {
      const buffer = await downloadFileFromDrive(candidate.cvDriveId)
      const parsed = await parseCvFromBuffer(buffer)

      const existingLower = new Set(skills.map((s) => s.toLowerCase()))
      const newSkills = (parsed.skills ?? []).filter((s) => !existingLower.has(s.toLowerCase()))
      const mergedSkills = newSkills.length > 0 ? [...skills, ...newSkills] : skills

      const data: Record<string, unknown> = {}
      if (Array.isArray(parsed.experience) && parsed.experience.length > 0) data.cvExperience = parsed.experience
      if (Array.isArray(parsed.education) && parsed.education.length > 0) data.cvEducation = parsed.education
      if (newSkills.length > 0) data.skills = mergedSkills
      if (!candidate.summary && parsed.summary) data.summary = parsed.summary

      if (Object.keys(data).length > 0) {
        db.candidate.update({ where: { id: candidate.id }, data }).catch((err) => {
          console.error(`[tenarai-cv] Failed to persist parsed CV for candidate ${candidate.id}:`, err)
        })
      }

      if (Array.isArray(parsed.experience)) experience = parsed.experience
      if (Array.isArray(parsed.education)) education = parsed.education
      skills = mergedSkills
      if (!candidate.summary && parsed.summary) summary = parsed.summary
    } catch (err) {
      console.error(`[tenarai-cv] On-demand parse failed for candidate ${candidate.id}:`, err)
    }
  }

  const anonymizedName = `${candidate.firstName} ${candidate.lastName.charAt(0).toUpperCase()}.`

  const positionSkillsNorm = [
    ...(position.coreSkills ?? []),
    ...(position.jdSkills ?? []),
  ].map(normalizeSkill)

  const matchingSkillSet = new Set(
    skills
      .filter((skill) => {
        const norm = normalizeSkill(skill)
        return positionSkillsNorm.some((ps) => ps.includes(norm) || norm.includes(ps))
      })
      .map((s) => s.toLowerCase())
  )

  const html = renderTenoraiCv({
    anonymizedName,
    positionTitle: position.title,
    country: candidate.country,
    seniority: null,
    yearsOfExperience: candidate.yearsOfExperience,
    summary,
    skills,
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
