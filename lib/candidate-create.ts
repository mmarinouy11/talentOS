import type { Prisma } from '@prisma/client'
import { db } from './db'
import { normalizeLinkedinHandle } from './linkedin'
import { realEmailOrNull } from './candidate-identifier'
import { availabilityWriteData, type StartAvailabilityValue } from './start-availability'

export type CreateCandidateInput = Omit<
  Prisma.CandidateUncheckedCreateInput,
  'email' | 'linkedinUrl' | 'linkedinHandle' | 'cvExperience' | 'cvEducation' | 'startAvailability' | 'availabilityUpdatedAt'
> & {
  email?: string | null
  linkedinUrl?: string | null
  cvExperience?: unknown[] | null
  cvEducation?: unknown[] | null
  startAvailability?: StartAvailabilityValue | null
}

// Creates a candidate the same way everywhere ("Create New", bulk CV upload): real email or null (never a
// placeholder), LinkedIn handle derived from the URL, CV experience/education only when present.
// Throws Prisma P2002 when the email/LinkedIn belongs to another (e.g. soft-deleted) candidate.
export function createCandidateRecord(input: CreateCandidateInput) {
  const { email, linkedinUrl, cvExperience, cvEducation, startAvailability, ...rest } = input
  return db.candidate.create({
    data: {
      ...rest,
      email: realEmailOrNull(email),
      linkedinUrl: linkedinUrl || null,
      linkedinHandle: normalizeLinkedinHandle(linkedinUrl),
      cvDriveId: rest.cvDriveId ?? null,
      cvOriginalName: rest.cvOriginalName ?? null,
      ...availabilityWriteData(startAvailability, null),
      ...(Array.isArray(cvExperience) && cvExperience.length > 0 ? { cvExperience: cvExperience as Prisma.InputJsonValue } : {}),
      ...(Array.isArray(cvEducation) && cvEducation.length > 0 ? { cvEducation: cvEducation as Prisma.InputJsonValue } : {}),
    },
  })
}
