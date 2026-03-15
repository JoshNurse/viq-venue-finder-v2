import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  const { role, name, email, mobile } = body

  const contact = await prisma.contact.upsert({
    where: {
      venueId_role: { venueId: id, role },
    },
    update: { name, email, mobile },
    create: { venueId: id, role, name, email, mobile },
  })

  return NextResponse.json(contact)
}
