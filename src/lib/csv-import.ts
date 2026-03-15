import Papa from 'papaparse'
import { prisma } from './db'

interface CsvRow {
  'Site Name': string
  'Site LGA': string
  'Approval': string
  'Site Type': string
  'Approved': string
  'Operational': string
  'Authority': string
  'SA4': string
  'SA2': string
}

function extractSitePrefix(siteName: string): { prefix: string | null; displayName: string } {
  const match = siteName.match(/\(S\d+\)\s*$/)
  if (match) {
    return {
      prefix: match[0].trim(),
      displayName: siteName.replace(match[0], '').trim(),
    }
  }
  return { prefix: null, displayName: siteName.trim() }
}

function cleanSiteType(type: string): string {
  const t = type.trim().toUpperCase()
  if (t.includes('CLUB')) return 'CLUB'
  if (t.includes('HOTEL')) return 'HOTEL'
  return t
}

// TODO: Implement ABR lookup enrichment for business names/ABN
// async function enrichWithAbr(venue: { displayName: string; approvalRef: string }) { ... }

export async function importCsv(csvUrl: string): Promise<string> {
  const importLog = await prisma.importLog.create({
    data: { status: 'RUNNING' },
  })

  try {
    const response = await fetch(csvUrl)
    const csvText = await response.text()

    const { data, errors } = Papa.parse<CsvRow>(csvText, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h: string) => h.trim(),
    })

    if (errors.length > 0) {
      console.warn('CSV parse warnings:', errors.slice(0, 5))
    }

    const validRows = data.filter(row => row['Site Name']?.trim())
    const seenKeys = new Set<string>()
    let created = 0
    let updated = 0
    const importErrors: string[] = []

    for (const row of validRows) {
      try {
        const { prefix, displayName } = extractSitePrefix(row['Site Name'])
        const approvalRef = row['Approval']?.trim()

        if (!approvalRef) continue

        const key = `${approvalRef}|${prefix || ''}`
        seenKeys.add(key)

        const csvData = {
          siteName: row['Site Name'].trim(),
          displayName,
          sitePrefix: prefix,
          siteType: cleanSiteType(row['Site Type'] || ''),
          approvedEgms: parseInt(row['Approved']) || 0,
          operationalEgms: row['Operational']?.trim() ? parseInt(row['Operational']) : null,
          sa4Region: row['SA4']?.trim() || null,
          sa2Region: row['SA2']?.trim() || null,
          lgaRegion: row['Site LGA']?.trim() || null,
          authorityRegion: row['Authority']?.trim() || null,
          approvalRef,
          csvLastSeen: new Date(),
          isActive: true,
        }

        const existing = await prisma.venue.findUnique({
          where: { approvalRef_sitePrefix: { approvalRef, sitePrefix: prefix || '' } },
        })

        if (existing) {
          await prisma.venue.update({
            where: { id: existing.id },
            data: {
              siteName: csvData.siteName,
              displayName: csvData.displayName,
              siteType: csvData.siteType,
              approvedEgms: csvData.approvedEgms,
              operationalEgms: csvData.operationalEgms,
              sa4Region: csvData.sa4Region,
              sa2Region: csvData.sa2Region,
              lgaRegion: csvData.lgaRegion,
              authorityRegion: csvData.authorityRegion,
              csvLastSeen: csvData.csvLastSeen,
              isActive: true,
            },
          })
          updated++
        } else {
          await prisma.venue.create({
            data: {
              ...csvData,
              sitePrefix: prefix || '',
              pipelineStage: 'NOT_CONTACTED',
            },
          })
          created++
        }
      } catch (err) {
        const msg = `Row error (${row['Site Name']}): ${err instanceof Error ? err.message : String(err)}`
        importErrors.push(msg)
      }
    }

    // Flag venues not seen in this import
    await prisma.venue.updateMany({
      where: {
        csvLastSeen: { lt: new Date(Date.now() - 60000) }, // not updated in last minute
      },
      data: { isActive: false },
    })

    await prisma.importLog.update({
      where: { id: importLog.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        rowsProcessed: validRows.length,
        venuesCreated: created,
        venuesUpdated: updated,
        errors: importErrors.length > 0 ? JSON.stringify(importErrors) : null,
      },
    })

    return importLog.id
  } catch (err) {
    await prisma.importLog.update({
      where: { id: importLog.id },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        errors: JSON.stringify([err instanceof Error ? err.message : String(err)]),
      },
    })
    throw err
  }
}
