import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { VendorForm } from '@/components/app/VendorForm'
import { VendorPortalLink } from '@/components/app/VendorPortalLink'
import { ReferralPortalLink } from '@/components/app/ReferralPortalLink'
import { VendorPositionAssignment } from '@/components/app/VendorPositionAssignment'

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
          <Link href="/vendors" className="hover:text-gray-900">Partners</Link>
          <span className="mx-2">›</span>
          <span className="text-gray-900">{vendor.name}</span>
          <span className="mx-2">›</span>
          <span className="text-gray-900">Edit</span>
        </nav>
        <h1 className="text-2xl font-semibold text-gray-900">Edit Partner</h1>
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
          type: vendor.type,
        }}
      />

      <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-2xl">
        <h2 className="text-base font-semibold text-gray-900 mb-1">Assigned Positions</h2>
        <p className="text-xs text-gray-500 mb-4">Manage which open positions this partner can submit candidates for.</p>
        <VendorPositionAssignment vendorId={vendor.id} />
      </div>

      {vendor.type !== 'REFERRAL_NETWORK' && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 max-w-2xl space-y-2">
          <p className="text-sm font-medium text-gray-700">Partner Portal Link</p>
          <p className="text-xs text-gray-500">Share this link with the partner so they can submit candidates directly.</p>
          <VendorPortalLink vendorId={vendor.id} initialToken={vendor.portalToken} />
        </div>
      )}

      {vendor.type === 'REFERRAL_NETWORK' && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 max-w-2xl space-y-2">
          <p className="text-sm font-medium text-gray-700">Referral Portal Link</p>
          <p className="text-xs text-gray-500">Share this link with referrers so they can submit candidates directly.</p>
          <ReferralPortalLink vendorId={vendor.id} initialToken={vendor.referralToken} />
        </div>
      )}
    </div>
  )
}
