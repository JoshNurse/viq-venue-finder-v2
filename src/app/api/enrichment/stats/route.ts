import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  const [total, withAbn, withGooglePlace, withCoordinates] = await Promise.all([
    prisma.venue.count({ where: { isActive: true } }),
    prisma.venue.count({ where: { isActive: true, abn: { not: null } } }),
    prisma.venue.count({ where: { isActive: true, googlePlaceId: { not: null } } }),
    prisma.venue.count({ where: { isActive: true, latitude: { not: null } } }),
  ])

  return NextResponse.json({
    total,
    withAbn,
    withGooglePlace,
    withCoordinates,
  })
}
