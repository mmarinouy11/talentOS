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
  linkedinSearchQueries: string[]
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <button
      onClick={copy}
      className="shrink-0 text-xs px-2 py-1 rounded border border-gray-200 text-gray-500 hover:text-gray-800 hover:border-gray-400 transition-colors"
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}

export function JDIntelligence({
  positionId,
  jdParsed,
  jdSummary,
  jdSkills,
  jdSeniority,
  jdLanguages,
  linkedinSearchQueries,
}: JDIntelligenceProps) {
  const router = useRouter()
  const [parsing, setParsing] = useState(false)
  const [generatingQueries, setGeneratingQueries] = useState(false)
  const [queries, setQueries] = useState<string[]>(linkedinSearchQueries)

  async function parse() {
    setParsing(true)
    await fetch(`/api/positions/${positionId}/parse-jd`, { method: 'POST' })
    setParsing(false)
    router.refresh()
  }

  async function generateQueries() {
    setGeneratingQueries(true)
    try {
      const res = await fetch(`/api/positions/${positionId}/generate-linkedin-queries`, { method: 'POST' })
      const json = await res.json()
      if (res.ok && json.queries) setQueries(json.queries)
    } finally {
      setGeneratingQueries(false)
    }
  }

  if (!jdParsed) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-medium text-gray-900 mb-1">JD Intelligence</h2>
        <p className="text-sm text-gray-500 mb-4">Parse the job description to extract required skills, seniority, and languages.</p>
        <Button size="sm" onClick={parse} disabled={parsing}>
          {parsing ? 'Parsing…' : 'Parse Job Description'}
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
          disabled={parsing}
          className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50"
        >
          {parsing ? 'Re-parsing…' : 'Re-parse'}
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

      {/* LinkedIn Search Queries */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">LinkedIn Search Queries</p>
          {queries.length === 0 && (
            <button
              onClick={generateQueries}
              disabled={generatingQueries}
              className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50"
            >
              {generatingQueries ? 'Generating…' : 'Generate'}
            </button>
          )}
          {queries.length > 0 && (
            <button
              onClick={generateQueries}
              disabled={generatingQueries}
              className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50"
            >
              {generatingQueries ? 'Regenerating…' : 'Regenerate'}
            </button>
          )}
        </div>

        {queries.length === 0 && !generatingQueries && (
          <p className="text-xs text-gray-400">No queries generated yet.</p>
        )}

        {generatingQueries && queries.length === 0 && (
          <p className="text-xs text-gray-400 italic">Generating…</p>
        )}

        {queries.length > 0 && (
          <div className="space-y-2">
            {queries.map((q, i) => (
              <div key={i} className="flex items-start gap-2">
                <code className="flex-1 block text-xs bg-gray-50 border border-gray-200 rounded px-3 py-2 font-mono text-gray-700 leading-relaxed break-all">
                  {q}
                </code>
                <CopyButton text={q} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
