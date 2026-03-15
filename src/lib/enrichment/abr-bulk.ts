import fs from 'fs'
import path from 'path'
import os from 'os'
import { execSync } from 'child_process'
import { XMLParser } from 'fast-xml-parser'
import { prisma } from '../db'
import { normalizeVenueName } from './normalize'
import type { EnrichmentLog } from '@prisma/client'

const BULK_URLS = [
  'https://data.gov.au/data/dataset/5bd7fcab-e315-42cb-8daf-50b7efc2027e/resource/0ae4d427-6fa8-4d40-8e76-c6909b5a071b/download/public_split_1_10.zip',
  'https://data.gov.au/data/dataset/5bd7fcab-e315-42cb-8daf-50b7efc2027e/resource/635fcb95-7864-4509-9fa7-a62a6e32b62d/download/public_split_11_20.zip',
]

interface AbrRecord {
  abn: string
  acn: string | null
  entityName: string
  businessNames: string[]
  tradingNames: string[]
}

function normalizeForMatch(name: string): string {
  return normalizeVenueName(name)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenOverlap(a: string, b: string): number {
  const tokensA = a.split(' ').filter(Boolean)
  const tokensB = new Set(b.split(' ').filter(Boolean))
  if (tokensA.length === 0) return 0
  const matches = tokensA.filter((t) => tokensB.has(t)).length
  return matches / tokensA.length
}

async function downloadFile(
  url: string,
  dest: string,
  signal: AbortSignal
): Promise<void> {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status}`)
  const buffer = Buffer.from(await res.arrayBuffer())
  fs.writeFileSync(dest, buffer)
}

function extractZip(zipPath: string, destDir: string): void {
  execSync(`unzip -o -q "${zipPath}" -d "${destDir}"`)
}

function parseXmlFile(
  filePath: string,
  index: Map<string, AbrRecord>
): number {
  const xml = fs.readFileSync(filePath, 'utf-8')

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (name) => name === 'ABR' || name === 'OtherEntity',
  })

  const parsed = parser.parse(xml)
  const transfer = parsed?.Transfer
  if (!transfer) return 0

  const records: unknown[] = Array.isArray(transfer.ABR)
    ? transfer.ABR
    : transfer.ABR
      ? [transfer.ABR]
      : []

  let count = 0

  for (const rec of records as Record<string, unknown>[]) {
    // Filter: replaced = "N"
    if (rec['@_recordLastUpdatedDate'] === undefined && rec['@_replaced'] === undefined) {
      // attributes might be missing — skip
    }
    if (String(rec['@_replaced']).toUpperCase() !== 'N') continue

    // Filter: ABN status = "ACT"
    const abnNode = rec.ABN as Record<string, unknown> | undefined
    if (!abnNode) continue
    const abnStatus = String(abnNode['@_status']).toUpperCase()
    if (abnStatus !== 'ACT') continue
    const abn = String(abnNode['#text'] || abnNode)

    // Filter: State = "QLD"
    const mainEntity = rec.MainEntity as Record<string, unknown> | undefined
    if (!mainEntity) continue

    const businessAddress = mainEntity.BusinessAddress as Record<string, unknown> | undefined
    const addressDetails = businessAddress?.AddressDetails as Record<string, unknown> | undefined
    const state = String(addressDetails?.State || '').toUpperCase()
    if (state !== 'QLD') continue

    // Extract entity name
    const nonIndName = (mainEntity.NonIndividualName as Record<string, unknown>)
      ?.NonIndividualNameText
    const entityName = nonIndName ? String(nonIndName) : ''
    if (!entityName) continue

    // Extract ACN
    const asicNode = rec.ASICNumber as Record<string, unknown> | undefined
    const acn = asicNode ? String(asicNode['#text'] || '') || null : null

    // Extract business names and trading names from OtherEntity
    const businessNames: string[] = []
    const tradingNames: string[] = []

    const otherEntities = rec.OtherEntity as Record<string, unknown>[] | undefined
    if (Array.isArray(otherEntities)) {
      for (const oe of otherEntities) {
        const nameText = (oe.NonIndividualName as Record<string, unknown>)
          ?.NonIndividualNameText
        if (!nameText) continue
        const nameStr = String(nameText)
        const oeType = String(oe['@_type'] || '').toUpperCase()
        if (oeType === 'TRD') {
          tradingNames.push(nameStr)
        } else if (oeType === 'BN') {
          businessNames.push(nameStr)
        }
      }
    }

    const record: AbrRecord = {
      abn,
      acn,
      entityName,
      businessNames,
      tradingNames,
    }

    // Index by entity name
    const normEntity = normalizeForMatch(entityName)
    if (normEntity) {
      index.set(normEntity, record)
    }

    // Also index by each business/trading name
    for (const bn of [...businessNames, ...tradingNames]) {
      const normBn = normalizeForMatch(bn)
      if (normBn && !index.has(normBn)) {
        index.set(normBn, record)
      }
    }

    count++
  }

  return count
}

function findMatch(
  venueNameNorm: string,
  index: Map<string, AbrRecord>
): AbrRecord | null {
  // 1. Exact match
  const exact = index.get(venueNameNorm)
  if (exact) return exact

  // 2. Substring match — check if venue name is contained in an index key or vice-versa
  for (const [key, record] of index) {
    if (key.includes(venueNameNorm) || venueNameNorm.includes(key)) {
      return record
    }
  }

  // 3. Token overlap (60%+ threshold)
  let bestRecord: AbrRecord | null = null
  let bestOverlap = 0

  for (const [key, record] of index) {
    const overlap = tokenOverlap(venueNameNorm, key)
    if (overlap >= 0.6 && overlap > bestOverlap) {
      bestOverlap = overlap
      bestRecord = record
    }
  }

  return bestRecord
}

export async function runAbrBulkEnrichment(
  log: EnrichmentLog,
  signal: AbortSignal
): Promise<void> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'abr-bulk-'))
  const errors: string[] = []

  try {
    // ========================================
    // PHASE 1: Download & Index
    // ========================================
    const index = new Map<string, AbrRecord>()
    let totalRecords = 0

    await prisma.enrichmentLog.update({
      where: { id: log.id },
      data: { currentVenue: 'Downloading ABR bulk extract...' },
    })

    for (let i = 0; i < BULK_URLS.length; i++) {
      if (signal.aborted) {
        await prisma.enrichmentLog.update({
          where: { id: log.id },
          data: { status: 'CANCELLED', completedAt: new Date() },
        })
        return
      }

      const zipFile = path.join(tmpDir, `abr_part_${i + 1}.zip`)
      const extractDir = path.join(tmpDir, `part_${i + 1}`)
      fs.mkdirSync(extractDir, { recursive: true })

      await prisma.enrichmentLog.update({
        where: { id: log.id },
        data: { currentVenue: `Downloading part ${i + 1} of ${BULK_URLS.length}...` },
      })

      await downloadFile(BULK_URLS[i], zipFile, signal)

      if (signal.aborted) {
        await prisma.enrichmentLog.update({
          where: { id: log.id },
          data: { status: 'CANCELLED', completedAt: new Date() },
        })
        return
      }

      await prisma.enrichmentLog.update({
        where: { id: log.id },
        data: { currentVenue: `Extracting part ${i + 1}...` },
      })

      extractZip(zipFile, extractDir)

      // Remove zip after extraction to save disk space
      fs.unlinkSync(zipFile)

      // Parse each XML file in the extracted directory
      const xmlFiles = fs
        .readdirSync(extractDir)
        .filter((f) => f.endsWith('.xml'))
        .sort()

      for (let j = 0; j < xmlFiles.length; j++) {
        if (signal.aborted) {
          await prisma.enrichmentLog.update({
            where: { id: log.id },
            data: { status: 'CANCELLED', completedAt: new Date() },
          })
          return
        }

        const xmlPath = path.join(extractDir, xmlFiles[j])

        await prisma.enrichmentLog.update({
          where: { id: log.id },
          data: {
            currentVenue: `Parsing ${xmlFiles[j]} (file ${j + 1}/${xmlFiles.length}, part ${i + 1})...`,
          },
        })

        try {
          const count = parseXmlFile(xmlPath, index)
          totalRecords += count
        } catch (err) {
          const msg = `XML parse error (${xmlFiles[j]}): ${err instanceof Error ? err.message : String(err)}`
          errors.push(msg)
        }

        // Remove XML file after parsing to free disk space
        fs.unlinkSync(xmlPath)
      }
    }

    await prisma.enrichmentLog.update({
      where: { id: log.id },
      data: {
        currentVenue: `Indexing complete. ${totalRecords} QLD records indexed. Starting venue matching...`,
      },
    })

    // ========================================
    // PHASE 2: Match & Update
    // ========================================
    const venues = await prisma.venue.findMany({
      where: { abn: null, isActive: true },
      select: { id: true, displayName: true },
    })

    await prisma.enrichmentLog.update({
      where: { id: log.id },
      data: { totalVenues: venues.length },
    })

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
        const venueNameNorm = normalizeForMatch(venue.displayName)
        if (!venueNameNorm) {
          await prisma.enrichmentLog.update({
            where: { id: log.id },
            data: { skipped: { increment: 1 } },
          })
          continue
        }

        const match = findMatch(venueNameNorm, index)

        if (!match) {
          await prisma.enrichmentLog.update({
            where: { id: log.id },
            data: { skipped: { increment: 1 } },
          })
          continue
        }

        await prisma.venue.update({
          where: { id: venue.id },
          data: {
            abn: match.abn,
            acn: match.acn,
            tradingName: match.tradingNames[0] || match.entityName,
            businessName: match.businessNames[0] || match.entityName,
          },
        })

        await prisma.enrichmentLog.update({
          where: { id: log.id },
          data: { enriched: { increment: 1 } },
        })
      } catch (err) {
        const msg = `Match error (${venue.displayName}): ${err instanceof Error ? err.message : String(err)}`
        errors.push(msg)
        await prisma.enrichmentLog.update({
          where: { id: log.id },
          data: { failed: { increment: 1 } },
        })
      }
    }

    await prisma.enrichmentLog.update({
      where: { id: log.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        errors: errors.length > 0 ? JSON.stringify(errors) : null,
      },
    })
  } finally {
    // Clean up temp directory
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch {
      // best-effort cleanup
    }
  }
}
