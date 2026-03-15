import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { cancelEnrichment } from '@/lib/enrichment/runner'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const log = await prisma.enrichmentLog.findUnique({ where: { id } })
  if (!log) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json(log)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const cancelled = cancelEnrichment(id)
  if (cancelled) {
    return NextResponse.json({ success: true })
  }
  return NextResponse.json({ error: 'No active enrichment with that ID' }, { status: 404 })
}
