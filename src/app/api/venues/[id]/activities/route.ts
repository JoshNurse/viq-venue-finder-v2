import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  const { type, note } = body

  const activity = await prisma.activity.create({
    data: {
      venueId: id,
      type,
      note,
    },
  })

  return NextResponse.json(activity)
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const activities = await prisma.activity.findMany({
    where: { venueId: id },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(activities)
}
