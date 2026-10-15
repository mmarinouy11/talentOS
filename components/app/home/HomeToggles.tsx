'use client'

import { useState, type ReactNode } from 'react'

const toggleBtn = 'text-xs font-medium text-gray-500 hover:text-gray-900 underline underline-offset-2'

// Table rows with only the first `limit` visible and a "Show all (N)" toggle row
export function LimitedRows({ rows, limit, colSpan }: { rows: ReactNode[]; limit: number; colSpan: number }) {
  const [open, setOpen] = useState(false)
  const visible = open ? rows : rows.slice(0, limit)
  return (
    <>
      {visible}
      {rows.length > limit && (
        <tr>
          <td colSpan={colSpan} className="px-3 py-2">
            <button type="button" className={toggleBtn} onClick={() => setOpen((o) => !o)}>
              {open ? 'Show less' : `Show all (${rows.length})`}
            </button>
          </td>
        </tr>
      )}
    </>
  )
}

// Rows hidden behind a toggle row, e.g. "3 already decided"
export function CollapsedRows({ rows, label, colSpan }: { rows: ReactNode[]; label: string; colSpan: number }) {
  const [open, setOpen] = useState(false)
  if (rows.length === 0) return null
  return (
    <>
      <tr>
        <td colSpan={colSpan} className="px-3 py-2 bg-gray-50">
          <button type="button" className={toggleBtn} onClick={() => setOpen((o) => !o)}>
            {open ? '▾' : '▸'} {label}
          </button>
        </td>
      </tr>
      {open && rows}
    </>
  )
}

// A summary row that expands to show detail content underneath
export function ExpandableRow({ cells, detail, colSpan }: { cells: ReactNode; detail: ReactNode; colSpan: number }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <tr className="hover:bg-[#F5F0EB] transition-colors cursor-pointer" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {cells}
        <td className="px-3 py-2 text-gray-400 text-xs w-6">{open ? '▾' : '▸'}</td>
      </tr>
      {open && (
        <tr>
          <td colSpan={colSpan} className="bg-gray-50 px-3 py-2">{detail}</td>
        </tr>
      )}
    </>
  )
}
