import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  const venues = await prisma.venue.findMany({
    where: {
      NOT: { siteName: { equals: prisma.venue.fields.displayName } },
    },
    select: { id: true, siteName: true, displayName: true, businessName: true, tradingName: true },
    orderBy: { displayName: 'asc' },
  })

  // Filter to only those where siteName != displayName
  const changed = venues.filter(v => v.siteName !== v.displayName)

  return NextResponse.json({ changes: changed, total: changed.length })
}
