import { prisma } from '../db'
import { normalizeVenueName, sleep } from './normalize'
import type { EnrichmentLog } from '@prisma/client'

interface PlaceResult {
  id: string
  displayName?: { text: string }
  formattedAddress?: string
  location?: { latitude: number; longitude: number }
  rating?: number
  nationalPhoneNumber?: string
  websiteUri?: string
}

const QLD_LOCATION_BIAS = {
  rectangle: {
    low: { latitude: -29.2, longitude: 138.0 },
    high: { latitude: -10.0, longitude: 154.0 },
  },
}

const FIELD_MASK =
  'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.nationalPhoneNumber,places.websiteUri'

async function searchPlace(
  query: string,
  apiKey: string
): Promise<PlaceResult | null> {
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
    throw new Error(`Google Places API error ${res.status}: ${text}`)
  }

  const data = await res.json()
  return data.places?.[0] || null
}

function parseConfidence(place: PlaceResult, venueName: string): string {
  if (!place.formattedAddress) return 'LOW'
  const addr = place.formattedAddress.toUpperCase()
  if (addr.includes('QLD') || addr.includes('QUEENSLAND')) return 'HIGH'
  return 'MEDIUM'
}

export async function runGooglePlacesEnrichment(
  log: EnrichmentLog,
  signal: AbortSignal
): Promise<void> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY environment variable not set')

  const venues = await prisma.venue.findMany({
    where: { googlePlaceId: null, isActive: true },
    select: { id: true, displayName: true, lgaRegion: true },
  })

  await prisma.enrichmentLog.update({
    where: { id: log.id },
    data: { totalVenues: venues.length },
  })

  const errors: string[] = []

  for (let i = 0; i < venues.length; i++) {
    if (signal.aborted) {
      await prisma.enrichmentLog.update({
        where: { id: log.id },
        data: { status: 'CANCELLED', completedAt: new Date() },
      })
      return
    }

    const venue = venues[i]
    await prisma.enrichmentLog.update({
      where: { id: log.id },
      data: { processed: i + 1, currentVenue: venue.displayName },
    })

    try {
      const name = normalizeVenueName(venue.displayName)
      const lga = venue.lgaRegion || ''
      const query = `"${name}" ${lga} Queensland Australia`
      const place = await searchPlace(query, apiKey)

      if (!place) {
        await prisma.enrichmentLog.update({
          where: { id: log.id },
          data: { skipped: { increment: 1 } },
        })
        await sleep(200)
        continue
      }

      const confidence = parseConfidence(place, name)

      await prisma.venue.update({
        where: { id: venue.id },
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
      })

      await prisma.enrichmentLog.update({
        where: { id: log.id },
        data: { enriched: { increment: 1 } },
      })
    } catch (err) {
      const msg = `Google error (${venue.displayName}): ${err instanceof Error ? err.message : String(err)}`
      errors.push(msg)
      await prisma.enrichmentLog.update({
        where: { id: log.id },
        data: { failed: { increment: 1 } },
      })
    }

    await sleep(200)
  }

  await prisma.enrichmentLog.update({
    where: { id: log.id },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
      errors: errors.length > 0 ? JSON.stringify(errors) : null,
    },
  })
}
