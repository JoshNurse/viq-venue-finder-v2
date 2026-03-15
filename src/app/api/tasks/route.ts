import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const completed = searchParams.get('completed')
  const overdue = searchParams.get('overdue')
  const upcoming = searchParams.get('upcoming')
  const venueId = searchParams.get('venueId')
  const limit = parseInt(searchParams.get('limit') || '50')

  const now = new Date()
  const sevenDaysFromNow = new Date(now)
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {}

  if (venueId) {
    where.venueId = venueId
  }

  if (overdue === 'true') {
    where.dueDate = { lt: now }
    where.completed = false
  } else if (upcoming === 'true') {
    where.dueDate = { gte: now, lte: sevenDaysFromNow }
    where.completed = false
  } else if (completed === 'true') {
    where.completed = true
  } else if (completed === 'false') {
    where.completed = false
  }

  const tasks = await prisma.task.findMany({
    where,
    include: {
      venue: {
        select: { id: true, displayName: true },
      },
    },
    orderBy: completed === 'true' ? { completedAt: 'desc' } : { dueDate: 'asc' },
    take: limit,
  })

  // Also return overdue count for badge
  const overdueCount = await prisma.task.count({
    where: {
      completed: false,
      dueDate: { lt: now },
    },
  })

  return NextResponse.json({ tasks, overdueCount })
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { venueId, type, dueDate, note } = body

  if (!venueId || !dueDate) {
    return NextResponse.json({ error: 'venueId and dueDate are required' }, { status: 400 })
  }

  const task = await prisma.task.create({
    data: {
      venueId,
      type: type || 'FOLLOW_UP',
      dueDate: new Date(dueDate),
      note: note || null,
    },
    include: {
      venue: {
        select: { id: true, displayName: true },
      },
    },
  })

  return NextResponse.json(task, { status: 201 })
}
