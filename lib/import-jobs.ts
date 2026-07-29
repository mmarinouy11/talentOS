export type Seniority = 'JUNIOR' | 'MID' | 'SENIOR' | 'STAFF' | 'PRINCIPAL'

export interface ParsedCandidate {
  fileName: string
  firstName: string | null
  lastName: string | null
  email: string | null
  phone: string | null
  country: string | null
  linkedinUrl: string | null
  seniority: Seniority | null
  yearsOfExperience: number | null
  skills: string[]
  languages: string[]
  summary: string | null
  experience: { title: string; company: string; startDate: string; endDate: string; bullets: string[] }[]
  education: { degree: string; institution: string; year?: string }[]
  cvDriveId: string | null
  cvOriginalName: string | null
  duplicate: boolean
  existingId?: string
  error?: string
}

export interface ImportJob {
  total: number
  completed: number
  done: boolean
  results: ParsedCandidate[]
  error?: string
}

export const importJobs = new Map<string, ImportJob>()

export function scheduleJobCleanup(jobId: string) {
  setTimeout(() => importJobs.delete(jobId), 30 * 60 * 1000)
}
