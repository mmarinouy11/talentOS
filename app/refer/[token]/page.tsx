'use client'

import { useParams } from 'next/navigation'
import { PortalPage } from '@/components/public/PortalPage'

export default function ReferralPortalPage() {
  const { token } = useParams<{ token: string }>()
  return <PortalPage mode="referral" token={token} />
}
