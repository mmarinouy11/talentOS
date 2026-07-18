import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { VendorsTable } from '@/components/app/VendorsTable'

export default async function VendorsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const vendors = await db.vendor.findMany({
    orderBy: { name: 'asc' },
    include: {
      _count: {
        select: {
          candidates: { where: { deletedAt: null } },
          positionVendors: { where: { position: { status: 'OPEN', deletedAt: null } } },
        },
      },
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Partners</h1>
          <p className="text-sm text-gray-500 mt-0.5">{vendors.length} staffing partner{vendors.length !== 1 ? 's' : ''}</p>
        </div>
        <Link href="/vendors/new">
          <Button>New Partner</Button>
        </Link>
      </div>

      {vendors.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
          <p className="text-gray-400 text-sm">No partners yet. Add your first staffing partner.</p>
          <Link href="/vendors/new">
            <Button className="mt-4" size="sm">New Partner</Button>
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <VendorsTable vendors={vendors} />
        </div>
      )}
    </div>
  )
}
