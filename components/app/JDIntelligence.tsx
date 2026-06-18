'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { SkillTags } from './SkillTags'
import { SeniorityBadge } from './SeniorityBadge'
import type { Seniority } from '@prisma/client'

interface JDIntelligenceProps {
  positionId: string
  jdParsed: boolean
  jdSummary: string | null
  jdSkills: string[]
  jdSeniority: Seniority | null
  jdLanguages: string[]
}

export function JDIntelligence({
  positionId,
  jdParsed,
  jdSummary,
  jdSkills,
  jdSeniority,
  jdLanguages,
}: JDIntelligenceProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function parse() {
    setLoading(true)
    await fetch(`/api/positions/${positionId}/parse-jd`, { method: 'POST' })
    setLoading(false)
    router.refresh()
  }

  if (!jdParsed) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-medium text-gray-900 mb-1">JD Intelligence</h2>
        <p className="text-sm text-gray-500 mb-4">Parse the job description to extract required skills, seniority, and languages.</p>
        <Button size="sm" onClick={parse} disabled={loading}>
          {loading ? 'Parsing…' : 'Parse Job Description'}
        </Button>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-gray-900">JD Intelligence</h2>
        <button
          onClick={parse}
          disabled={loading}
          className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50"
        >
          {loading ? 'Re-parsing…' : 'Re-parse'}
        </button>
      </div>

      {jdSummary && (
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Role Summary</p>
          <p className="text-sm text-gray-700">{jdSummary}</p>
        </div>
      )}

      {jdSkills.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Required Skills</p>
          <SkillTags tags={jdSkills} />
        </div>
      )}

      <div className="flex gap-6">
        {jdSeniority && (
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Expected Seniority</p>
            <SeniorityBadge seniority={jdSeniority} />
          </div>
        )}
        {jdLanguages.length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Required Languages</p>
            <SkillTags tags={jdLanguages} />
          </div>
        )}
      </div>
    </div>
  )
}
