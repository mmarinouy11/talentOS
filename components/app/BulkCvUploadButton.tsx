'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { BulkCvUploadForm } from './BulkCvUploadForm'

// /candidates header: talent-pool batch (no position)
export function BulkCvUploadButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>Upload CVs</Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
              <h2 className="text-sm font-semibold text-gray-900">Upload CVs to the talent pool</h2>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
            </div>
            <div className="overflow-y-auto px-6 py-4">
              <BulkCvUploadForm onClose={() => setOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
