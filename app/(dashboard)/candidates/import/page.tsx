'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { LinkedInImportFlow } from '@/components/app/LinkedInImportFlow'
import type { ConfirmResult } from '@/app/api/candidates/bulk-import/confirm/route'

export default function BulkImportPage() {
  const router = useRouter()

  function handleDone(result: ConfirmResult) {
    if (result.created > 0) {
      router.push('/candidates')
    }
    // if nothing was created just stay — the flow shows its own "done" screen
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Import from LinkedIn</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Upload a .zip file containing LinkedIn profile PDFs to bulk-create candidates
          </p>
        </div>
        <Button variant="outline" onClick={() => router.push('/candidates')}>
          Back to Candidates
        </Button>
      </div>

      <LinkedInImportFlow
        onDone={handleDone}
        onCancel={() => router.push('/candidates')}
      />
    </div>
  )
}
