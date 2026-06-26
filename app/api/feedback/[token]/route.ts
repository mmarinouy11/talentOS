import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const interview = await db.interview.findUnique({
    where: { magicLinkToken: token },
    include: {
      candidatePosition: {
        include: {
          candidate: { select: { firstName: true, lastName: true } },
          position: { select: { title: true, client: true, jdSkills: true } },
        },
      },
    },
  })

  if (!interview) {
    return NextResponse.json({ invalid: true })
  }

  if (interview.magicLinkUsedAt) {
    return NextResponse.json({ used: true })
  }

  if (interview.magicLinkExpiresAt && interview.magicLinkExpiresAt < new Date()) {
    return NextResponse.json({ expired: true })
  }

  const cp = interview.candidatePosition
  return NextResponse.json({
    interviewId: interview.id,
    stage: interview.stage,
    candidateName: `${cp.candidate.firstName} ${cp.candidate.lastName}`,
    positionTitle: cp.position.title,
    client: cp.position.client,
    jdSkills: cp.position.jdSkills,
  })
}
