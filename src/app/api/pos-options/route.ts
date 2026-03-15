import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  const options = await prisma.posOption.findMany({
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  })
  return NextResponse.json(options)
}

export async function POST(request: NextRequest) {
  const { name } = await request.json()

  const option = await prisma.posOption.upsert({
    where: { name },
    update: {},
    create: { name, isDefault: false },
  })

  return NextResponse.json(option)
}
