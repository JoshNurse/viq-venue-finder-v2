import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  const { completed, note, dueDate, type } = body

  const task = await prisma.task.findUnique({ where: { id } })
  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: any = {}
  if (completed !== undefined) {
    updateData.completed = completed
    updateData.completedAt = completed ? new Date() : null
  }
  if (note !== undefined) updateData.note = note
  if (dueDate !== undefined) updateData.dueDate = new Date(dueDate)
  if (type !== undefined) updateData.type = type

  const updated = await prisma.task.update({
    where: { id },
    data: updateData,
    include: {
      venue: {
        select: { id: true, displayName: true },
      },
    },
  })

  return NextResponse.json(updated)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const task = await prisma.task.findUnique({ where: { id } })
  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }

  await prisma.task.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
