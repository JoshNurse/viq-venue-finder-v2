import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const venue = await prisma.venue.findUnique({
    where: { id },
    include: {
      contacts: true,
      activities: {
        orderBy: { createdAt: 'desc' },
        take: 50,
      },
    },
  })

  if (!venue) {
    return NextResponse.json({ error: 'Venue not found' }, { status: 404 })
  }

  return NextResponse.json(venue)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  const {
    posSystem, lmo, venuePhone, notes, pipelineStage, stageChangeNote,
    latitude, longitude, streetAddress, geocodeSource, geocodeConfidence,
    displayName, tradingName, businessName, googleAddress, googlePhone, googleWebsite, googleRating,
  } = body

  const venue = await prisma.venue.findUnique({ where: { id } })
  if (!venue) {
    return NextResponse.json({ error: 'Venue not found' }, { status: 404 })
  }

  const updateData: any = {}
  const editedFields: string[] = []

  // Business info edits (with change tracking)
  const trackableFields = { displayName, tradingName, businessName, googleAddress, googlePhone, googleWebsite, googleRating } as Record<string, any>
  for (const [key, value] of Object.entries(trackableFields)) {
    if (value !== undefined && value !== (venue as any)[key]) {
      editedFields.push(`${key}: "${(venue as any)[key] || ''}" → "${value}"`)
      updateData[key] = value
    }
  }

  if (posSystem !== undefined) updateData.posSystem = posSystem
  if (lmo !== undefined) updateData.lmo = lmo
  if (venuePhone !== undefined) updateData.venuePhone = venuePhone
  if (notes !== undefined) updateData.notes = notes
  if (latitude !== undefined) updateData.latitude = latitude
  if (longitude !== undefined) updateData.longitude = longitude
  if (streetAddress !== undefined) updateData.streetAddress = streetAddress
  if (geocodeSource !== undefined) updateData.geocodeSource = geocodeSource
  if (geocodeConfidence !== undefined) updateData.geocodeConfidence = geocodeConfidence

  // Log business info edits as activities
  if (editedFields.length > 0) {
    await prisma.activity.create({
      data: {
        venueId: id,
        type: 'DATA_EDIT',
        note: editedFields.join('\n'),
      },
    })
  }

  // Handle pipeline stage change with activity logging
  if (pipelineStage !== undefined && pipelineStage !== venue.pipelineStage) {
    updateData.pipelineStage = pipelineStage
    const noteText = stageChangeNote
      ? `Pipeline stage changed from ${venue.pipelineStage} to ${pipelineStage}: ${stageChangeNote}`
      : `Pipeline stage changed from ${venue.pipelineStage} to ${pipelineStage}`
    await prisma.activity.create({
      data: {
        venueId: id,
        type: 'STAGE_CHANGE',
        note: noteText,
      },
    })
  }

  const updated = await prisma.venue.update({
    where: { id },
    data: updateData,
    include: {
      contacts: true,
      activities: {
        orderBy: { createdAt: 'desc' },
        take: 50,
      },
    },
  })

  return NextResponse.json(updated)
}
