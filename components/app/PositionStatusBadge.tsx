import type { PositionStatus } from '@prisma/client'
import { Badge } from '@/components/ui/badge'

const config: Record<PositionStatus, { label: string; variant: 'success' | 'warning' | 'default' | 'info' }> = {
  OPEN: { label: 'Open', variant: 'success' },
  ON_HOLD: { label: 'On Hold', variant: 'warning' },
  CANCELLED: { label: 'Cancelled', variant: 'default' },
  FILLED: { label: 'Filled', variant: 'info' },
  CLOSED: { label: 'Closed', variant: 'default' },
}

export function PositionStatusBadge({ status }: { status: PositionStatus }) {
  const { label, variant } = config[status]
  return <Badge variant={variant}>{label}</Badge>
}
