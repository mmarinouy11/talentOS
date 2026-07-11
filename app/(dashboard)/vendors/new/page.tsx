import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { VendorForm } from '@/components/app/VendorForm'

export default async function NewVendorPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  return (
    <div className="space-y-6">
      <div>
        <nav className="text-sm text-gray-500 mb-1">
          <Link href="/vendors" className="hover:text-gray-900">Partners</Link>
          <span className="mx-2">›</span>
          <span className="text-gray-900">New Partner</span>
        </nav>
        <h1 className="text-2xl font-semibold text-gray-900">New Partner</h1>
      </div>
      <VendorForm mode="create" />
    </div>
  )
}
