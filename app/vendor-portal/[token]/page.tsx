'use client'

import { useParams } from 'next/navigation'
import { PortalPage } from '@/components/public/PortalPage'

export default function VendorPortalPage() {
  const { token } = useParams<{ token: string }>()
  return <PortalPage mode="vendor" token={token} />
}
