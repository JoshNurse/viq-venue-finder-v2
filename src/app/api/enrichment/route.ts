import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { startEnrichment, type EnrichmentType } from '@/lib/enrichment/runner'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const type = body.type as EnrichmentType

    if (!['ABR', 'GOOGLE_PLACES', 'NOMINATIM', 'ALL'].includes(type)) {
      return NextResponse.json(
        { error: 'Invalid type. Must be ABR, GOOGLE_PLACES, NOMINATIM, or ALL' },
        { status: 400 }
      )
    }

    // Check if there's already a running enrichment
    const running = await prisma.enrichmentLog.findFirst({
      where: { status: 'RUNNING' },
    })
    if (running) {
      return NextResponse.json(
        { error: 'An enrichment is already running', runningId: running.id },
        { status: 409 }
      )
    }

    const logIds = await startEnrichment(type)
    return NextResponse.json({ logIds })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function GET() {
  const logs = await prisma.enrichmentLog.findMany({
    orderBy: { startedAt: 'desc' },
    take: 20,
  })
  return NextResponse.json(logs)
}
