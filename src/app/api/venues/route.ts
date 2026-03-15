import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search') || ''
  const type = searchParams.get('type') || ''
  const stage = searchParams.get('stage') || ''
  const region = searchParams.get('region') || ''
  const pos = searchParams.get('pos') || ''
  const lmo = searchParams.get('lmo') || ''
  const active = searchParams.get('active') !== 'false'
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '50')
  const offset = (page - 1) * limit

  const where: any = {}

  if (active) where.isActive = true
  if (search) {
    where.OR = [
      { displayName: { contains: search } },
      { siteName: { contains: search } },
      { lgaRegion: { contains: search } },
      { sa2Region: { contains: search } },
    ]
  }
  if (type) where.siteType = type
  if (stage) where.pipelineStage = stage
  if (region) where.lgaRegion = region
  if (pos) where.posSystem = pos
  if (lmo) where.lmo = lmo

  const [venues, total] = await Promise.all([
    prisma.venue.findMany({
      where,
      orderBy: { displayName: 'asc' },
      skip: offset,
      take: limit,
      include: {
        activities: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    }),
    prisma.venue.count({ where }),
  ])

  return NextResponse.json({
    venues,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  })
}
