'use client'

import { useRouter } from 'next/navigation'

interface Vendor {
  id: string
  name: string
  pocName: string | null
  pocEmail: string | null
  phone: string | null
  active: boolean
  _count: { candidates: number; positionVendors: number }
}

export function VendorsTable({ vendors }: { vendors: Vendor[] }) {
  const router = useRouter()

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b-[2px] border-b-[#8DF000] bg-gray-50">
          <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
          <th className="text-left px-4 py-3 font-medium text-gray-600">Point of Contact</th>
          <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
          <th className="text-left px-4 py-3 font-medium text-gray-600">Phone</th>
          <th className="text-left px-4 py-3 font-medium text-gray-600">Candidates</th>
          <th className="text-left px-4 py-3 font-medium text-gray-600">Active Positions</th>
          <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50">
        {vendors.map((v) => (
          <tr
            key={v.id}
            className="hover:bg-[#F5F0EB] transition-colors cursor-pointer"
            onClick={() => router.push(`/vendors/${v.id}/edit`)}
          >
            <td className="px-4 py-3 font-medium text-gray-900">{v.name}</td>
            <td className="px-4 py-3 text-gray-600">{v.pocName ?? '—'}</td>
            <td
              className="px-4 py-3 text-gray-600"
              onClick={(e) => e.stopPropagation()}
            >
              {v.pocEmail
                ? <a href={`mailto:${v.pocEmail}`} className="hover:underline">{v.pocEmail}</a>
                : '—'}
            </td>
            <td className="px-4 py-3 text-gray-600">{v.phone ?? '—'}</td>
            <td className="px-4 py-3 text-gray-600">{v._count.candidates}</td>
            <td className="px-4 py-3 text-gray-600">
              {v._count.positionVendors > 0 ? v._count.positionVendors : '—'}
            </td>
            <td className="px-4 py-3">
              {v.active
                ? <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Active</span>
                : <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">Inactive</span>
              }
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
