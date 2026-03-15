import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  // Build date filter for activity-based queries
  const activityDateFilter: any = {}
  if (from) {
    activityDateFilter.createdAt = { ...activityDateFilter.createdAt, gte: new Date(from) }
  }
  if (to) {
    const toDate = new Date(to)
    toDate.setHours(23, 59, 59, 999)
    activityDateFilter.createdAt = { ...activityDateFilter.createdAt, lte: toDate }
  }

  const hasDateFilter = from || to

  const [
    totalVenues,
    activeVenues,
    byStage,
    byType,
    byRegion,
    byPos,
    byLmo,
    totalEgms,
    wonEgms,
    recentActivities,
    activityCounts,
  ] = await Promise.all([
    prisma.venue.count(),
    prisma.venue.count({ where: { isActive: true } }),
    // Pipeline stage counts are NOT filtered by date - always show current state
    prisma.venue.groupBy({ by: ['pipelineStage'], _count: true, where: { isActive: true } }),
    prisma.venue.groupBy({ by: ['siteType'], _count: true, where: { isActive: true } }),
    prisma.venue.groupBy({ by: ['lgaRegion'], _count: true, where: { isActive: true }, orderBy: { _count: { lgaRegion: 'desc' } }, take: 20 }),
    prisma.venue.groupBy({ by: ['posSystem'], _count: true, where: { isActive: true, posSystem: { not: null } } }),
    prisma.venue.groupBy({ by: ['lmo'], _count: true, where: { isActive: true, lmo: { not: null } } }),
    prisma.venue.aggregate({ _sum: { approvedEgms: true }, where: { isActive: true } }),
    prisma.venue.aggregate({ _sum: { approvedEgms: true }, where: { isActive: true, pipelineStage: 'WON' } }),
    // Recent activities respect date filter
    prisma.activity.findMany({
      where: hasDateFilter ? activityDateFilter : {},
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { venue: { select: { displayName: true } } },
    }),
    // Activity counts by type, respect date filter
    hasDateFilter
      ? prisma.activity.groupBy({
          by: ['type'],
          _count: true,
          where: activityDateFilter,
        })
      : prisma.activity.groupBy({
          by: ['type'],
          _count: true,
        }),
  ])

  return NextResponse.json({
    totalVenues,
    activeVenues,
    byStage,
    byType,
    byRegion,
    byPos,
    byLmo,
    totalEgms: totalEgms._sum.approvedEgms || 0,
    wonEgms: wonEgms._sum.approvedEgms || 0,
    recentActivities,
    activityCounts,
  })
}
