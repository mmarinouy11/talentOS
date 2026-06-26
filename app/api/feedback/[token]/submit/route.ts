import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const submitSchema = z.object({
  overallScore: z.number().int().min(1).max(5),
  generalNotes: z.string().optional().default(''),
  skillRatings: z.array(z.object({
    skillName: z.string().min(1),
    rating: z.number().int().min(0).max(5),
    comment: z.string().optional().default(''),
  })).optional().default([]),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const interview = await db.interview.findUnique({
    where: { magicLinkToken: token },
  })

  if (!interview) return NextResponse.json({ error: 'Invalid link' }, { status: 404 })
  if (interview.magicLinkUsedAt) return NextResponse.json({ error: 'Feedback already submitted' }, { status: 409 })
  if (interview.magicLinkExpiresAt && interview.magicLinkExpiresAt < new Date()) {
    return NextResponse.json({ error: 'Link has expired' }, { status: 410 })
  }

  const body = await req.json().catch(() => null)
  const parsed = submitSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { overallScore, generalNotes, skillRatings } = parsed.data

  await db.$transaction(async (tx) => {
    if (skillRatings.length > 0) {
      await tx.interviewSkillRating.createMany({
        data: skillRatings
          .filter((sr) => sr.rating > 0)
          .map((sr) => ({
            interviewId: interview.id,
            skillName: sr.skillName,
            rating: sr.rating,
            comment: sr.comment || null,
          })),
      })
    }

    await tx.interview.update({
      where: { id: interview.id },
      data: {
        humanScore: overallScore,
        feedbackSummary: generalNotes || null,
        feedbackParseMethod: 'interviewer_form',
        magicLinkUsedAt: new Date(),
        status: 'COMPLETED',
      },
    })
  })

  return NextResponse.json({ ok: true })
}
