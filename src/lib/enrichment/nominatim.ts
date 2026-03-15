import { prisma } from '../db'
import { normalizeVenueName, sleep } from './normalize'
import type { EnrichmentLog } from '@prisma/client'

interface NominatimResult {
  lat: string
  lon: string
  display_name: string
  boundingbox: string[]
}

const QLD_BOUNDS = {
  minLat: -29.2,
  maxLat: -10.0,
  minLon: 138.0,
  maxLon: 154.0,
}

function isInQld(lat: number, lon: number): boolean {
  return (
    lat >= QLD_BOUNDS.minLat &&
    lat <= QLD_BOUNDS.maxLat &&
    lon >= QLD_BOUNDS.minLon &&
    lon <= QLD_BOUNDS.maxLon
  )
}

async function geocode(query: string): Promise<NominatimResult[]> {
  const encoded = encodeURIComponent(query)
  const url = `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=3&countrycodes=au`
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'VIQVenueFinder/1.0 (venue-enrichment)',
    },
  })
  if (!res.ok) throw new Error(`Nominatim error ${res.status}`)
  return res.json()
}

export async function runNominatimEnrichment(
  log: EnrichmentLog,
  signal: AbortSignal
): Promise<void> {
  // Only target venues that still have no coordinates after Google Places
  const venues = await prisma.venue.findMany({
    where: { latitude: null, isActive: true },
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
      const query = `${name} ${venue.lgaRegion || ''} QLD Australia`
      const results = await geocode(query)

      // Find first result within QLD bounds
      const match = results.find((r) => {
        const lat = parseFloat(r.lat)
        const lon = parseFloat(r.lon)
        return isInQld(lat, lon)
      })

      if (!match) {
        await prisma.enrichmentLog.update({
          where: { id: log.id },
          data: { skipped: { increment: 1 } },
        })
        await sleep(1100)
        continue
      }

      await prisma.venue.update({
        where: { id: venue.id },
        data: {
          latitude: parseFloat(match.lat),
          longitude: parseFloat(match.lon),
          streetAddress: match.display_name,
          geocodeSource: 'NOMINATIM',
          geocodeConfidence: 'LOW',
        },
      })

      await prisma.enrichmentLog.update({
        where: { id: log.id },
        data: { enriched: { increment: 1 } },
      })
    } catch (err) {
      const msg = `Nominatim error (${venue.displayName}): ${err instanceof Error ? err.message : String(err)}`
      errors.push(msg)
      await prisma.enrichmentLog.update({
        where: { id: log.id },
        data: { failed: { increment: 1 } },
      })
    }

    await sleep(1100) // Strict OSM rate limit
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
