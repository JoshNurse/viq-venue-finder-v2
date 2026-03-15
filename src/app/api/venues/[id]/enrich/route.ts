import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { normalizeVenueName } from '@/lib/enrichment/normalize'

const QLD_LOCATION_BIAS = {
  rectangle: {
    low: { latitude: -29.2, longitude: 138.0 },
    high: { latitude: -10.0, longitude: 154.0 },
  },
}

const FIELD_MASK =
  'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.nationalPhoneNumber,places.websiteUri'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Google Places API key not configured' }, { status: 500 })
  }

  const venue = await prisma.venue.findUnique({
    where: { id },
    select: { id: true, displayName: true, lgaRegion: true },
  })

  if (!venue) {
    return NextResponse.json({ error: 'Venue not found' }, { status: 404 })
  }

  const name = normalizeVenueName(venue.displayName)
  const lga = venue.lgaRegion || ''
  const query = `"${name}" ${lga} Queensland Australia`

  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify({
      textQuery: query,
      locationBias: QLD_LOCATION_BIAS,
      maxResultCount: 1,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    return NextResponse.json({ error: `Google Places API error: ${text}` }, { status: 502 })
  }

  const data = await res.json()
  const place = data.places?.[0]

  if (!place) {
    return NextResponse.json({ error: 'No results found on Google Places' }, { status: 404 })
  }

  const addr = (place.formattedAddress || '').toUpperCase()
  const confidence = addr.includes('QLD') || addr.includes('QUEENSLAND') ? 'HIGH' : 'MEDIUM'

  const updated = await prisma.venue.update({
    where: { id },
    data: {
      googlePlaceId: place.id,
      googleAddress: place.formattedAddress || null,
      latitude: place.location?.latitude || null,
      longitude: place.location?.longitude || null,
      googlePhone: place.nationalPhoneNumber || null,
      googleRating: place.rating || null,
      googleWebsite: place.websiteUri || null,
      streetAddress: place.formattedAddress || null,
      geocodeSource: 'GOOGLE',
      geocodeConfidence: confidence,
    },
    include: {
      contacts: true,
      activities: {
        orderBy: { createdAt: 'desc' },
        take: 50,
      },
    },
  })

  await prisma.activity.create({
    data: {
      venueId: id,
      type: 'DATA_EDIT',
      note: `Re-enriched from Google Places with query: "${name}"`,
    },
  })

  return NextResponse.json(updated)
}
