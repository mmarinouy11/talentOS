'use client'

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="px-3 py-1.5 bg-black text-white text-sm rounded-lg hover:bg-gray-800 ml-auto"
    >
      🖨 Print / Save as PDF
    </button>
  )
}
