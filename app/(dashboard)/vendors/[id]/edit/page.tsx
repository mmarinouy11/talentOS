import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { VendorForm } from '@/components/app/VendorForm'

export default async function EditVendorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { id } = await params
  const vendor = await db.vendor.findUnique({ where: { id } })
  if (!vendor) notFound()

  return (
    <div className="space-y-6">
      <div>
        <nav className="text-sm text-gray-500 mb-1">
          <Link href="/vendors" className="hover:text-gray-900">Vendors</Link>
          <span className="mx-2">›</span>
          <span className="text-gray-900">{vendor.name}</span>
          <span className="mx-2">›</span>
          <span className="text-gray-900">Edit</span>
        </nav>
        <h1 className="text-2xl font-semibold text-gray-900">Edit Vendor</h1>
      </div>
      <VendorForm
        mode="edit"
        defaultValues={{
          id: vendor.id,
          name: vendor.name,
          pocName: vendor.pocName,
          pocEmail: vendor.pocEmail,
          phone: vendor.phone,
          notes: vendor.notes,
          active: vendor.active,
        }}
      />
    </div>
  )
}
