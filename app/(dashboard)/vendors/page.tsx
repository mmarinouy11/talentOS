import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default async function VendorsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const vendors = await db.vendor.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { candidates: { where: { deletedAt: null } } } } },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Vendors</h1>
          <p className="text-sm text-gray-500 mt-0.5">{vendors.length} staffing partner{vendors.length !== 1 ? 's' : ''}</p>
        </div>
        <Link href="/vendors/new">
          <Button>New Vendor</Button>
        </Link>
      </div>

      {vendors.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
          <p className="text-gray-400 text-sm">No vendors yet. Add your first staffing partner.</p>
          <Link href="/vendors/new">
            <Button className="mt-4" size="sm">New Vendor</Button>
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-[2px] border-b-[#8DF000] bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Point of Contact</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Phone</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Candidates</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {vendors.map((v) => (
                <tr key={v.id} className="hover:bg-[#F5F0EB] transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{v.name}</td>
                  <td className="px-4 py-3 text-gray-600">{v.pocName ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {v.pocEmail
                      ? <a href={`mailto:${v.pocEmail}`} className="hover:underline">{v.pocEmail}</a>
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{v.phone ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{v._count.candidates}</td>
                  <td className="px-4 py-3">
                    {v.active
                      ? <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Active</span>
                      : <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">Inactive</span>
                    }
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      <Link href={`/vendors/${v.id}/edit`}>
                        <Button variant="outline" size="sm">Edit</Button>
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
