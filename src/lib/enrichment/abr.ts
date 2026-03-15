import { prisma } from '../db'
import { normalizeVenueName, sleep } from './normalize'
import type { EnrichmentLog } from '@prisma/client'

interface AbrSearchResult {
  Abn: string
  AbnStatus: string
  Name: string
  NameType: string
  Score: number
  State: string
}

interface AbrDetail {
  Abn: string
  AbnStatus: string
  Acn: string
  EntityName: string
  EntityTypeName: string
  BusinessName: string[]
  AddressState: string
}

function stripCallback(text: string): string {
  // ABR wraps JSON in callback("...") — strip it
  const match = text.match(/callback\((.*)\)/)
  return match ? match[1] : text
}

async function searchAbr(name: string, guid: string): Promise<AbrSearchResult[]> {
  const encoded = encodeURIComponent(name)
  const url = `https://abr.business.gov.au/json/MatchingNames.aspx?name=${encoded}&maxResults=10&guid=${guid}`
  const res = await fetch(url)
  const text = await res.text()
  const data = JSON.parse(stripCallback(text))
  return data.Names || []
}

async function fetchAbnDetails(abn: string, guid: string): Promise<AbrDetail | null> {
  const url = `https://abr.business.gov.au/json/AbnDetails.aspx?abn=${abn}&callback=callback&guid=${guid}`
  const res = await fetch(url)
  const text = await res.text()
  const data = JSON.parse(stripCallback(text))
  if (data.Abn) return data as AbrDetail
  return null
}

function isActiveStatus(status: string): boolean {
  // ABR search returns coded values, details returns text
  // 0000000001 = Active, 0000000002 = Active (current period)
  return status === 'Active' || status === '0000000001' || status === '0000000002'
}

function bestMatch(results: AbrSearchResult[], venueName: string): AbrSearchResult | null {
  // Filter to QLD active businesses, pick highest score
  const qldResults = results.filter(
    (r) => r.State === 'QLD' && isActiveStatus(r.AbnStatus)
  )
  if (qldResults.length === 0) return null
  qldResults.sort((a, b) => b.Score - a.Score)
  return qldResults[0]
}

export async function runAbrEnrichment(
  log: EnrichmentLog,
  signal: AbortSignal
): Promise<void> {
  const guid = process.env.ABR_GUID
  if (!guid) throw new Error('ABR_GUID environment variable not set')

  const venues = await prisma.venue.findMany({
    where: { abn: null, isActive: true },
    select: { id: true, displayName: true },
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
      const searchName = normalizeVenueName(venue.displayName)
      const results = await searchAbr(searchName, guid)
      const match = bestMatch(results, searchName)

      if (!match) {
        await prisma.enrichmentLog.update({
          where: { id: log.id },
          data: { skipped: { increment: 1 } },
        })
        await sleep(500)
        continue
      }

      const details = await fetchAbnDetails(match.Abn, guid)
      await sleep(200) // extra delay between detail call and next search

      if (details && details.AbnStatus === 'Active') {
        await prisma.venue.update({
          where: { id: venue.id },
          data: {
            abn: details.Abn,
            acn: details.Acn || null,
            tradingName: match.Name,
            businessName: details.BusinessName?.[0] || details.EntityName,
          },
        })
        await prisma.enrichmentLog.update({
          where: { id: log.id },
          data: { enriched: { increment: 1 } },
        })
      } else {
        await prisma.enrichmentLog.update({
          where: { id: log.id },
          data: { skipped: { increment: 1 } },
        })
      }
    } catch (err) {
      const msg = `ABR error (${venue.displayName}): ${err instanceof Error ? err.message : String(err)}`
      errors.push(msg)
      await prisma.enrichmentLog.update({
        where: { id: log.id },
        data: { failed: { increment: 1 } },
      })
    }

    await sleep(500)
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
