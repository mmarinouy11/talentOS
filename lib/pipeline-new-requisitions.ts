import { db } from './db'

// Requisitions opened in the period: created as a requisition, or a proactive position converted in the period
export async function getNewRequisitions(fromDate: Date, toDate: Date): Promise<{ title: string; client: string }[]> {
  const positions = await db.position.findMany({
    where: {
      type: 'REQUISITION',
      deletedAt: null,
      status: { not: 'CANCELLED' },
      OR: [
        { createdAt: { gte: fromDate, lte: toDate } },
        { convertedAt: { gte: fromDate, lte: toDate } },
      ],
    },
    select: { title: true, client: true, createdAt: true, convertedAt: true },
  })
  return positions
    .sort((a, b) => (a.convertedAt ?? a.createdAt).getTime() - (b.convertedAt ?? b.createdAt).getTime())
    .map((p) => ({ title: p.title, client: p.client }))
}
