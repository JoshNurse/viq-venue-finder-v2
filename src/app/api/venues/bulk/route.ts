import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function PATCH(request: NextRequest) {
  const { ids, pipelineStage } = await request.json()

  if (!ids?.length || !pipelineStage) {
    return NextResponse.json({ error: 'ids and pipelineStage required' }, { status: 400 })
  }

  const result = await prisma.$transaction(async (tx) => {
    // Get current stages for activity logging
    const venues = await tx.venue.findMany({
      where: { id: { in: ids } },
      select: { id: true, pipelineStage: true },
    })

    // Update all venues
    await tx.venue.updateMany({
      where: { id: { in: ids } },
      data: { pipelineStage },
    })

    // Create stage change activities
    await tx.activity.createMany({
      data: venues.map((v) => ({
        venueId: v.id,
        type: 'STAGE_CHANGE',
        note: `Bulk moved from ${v.pipelineStage} to ${pipelineStage}`,
      })),
    })

    return venues.length
  })

  return NextResponse.json({ updated: result })
}
