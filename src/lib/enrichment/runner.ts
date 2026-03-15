import { prisma } from '../db'
import { runAbrEnrichment } from './abr'
import { runGooglePlacesEnrichment } from './google-places'
import { runNominatimEnrichment } from './nominatim'

export type EnrichmentType = 'ABR' | 'GOOGLE_PLACES' | 'NOMINATIM' | 'ALL'

// Track active enrichments so we can cancel them
const activeControllers = new Map<string, AbortController>()

async function runSingleStep(
  type: 'ABR' | 'GOOGLE_PLACES' | 'NOMINATIM',
  signal: AbortSignal
): Promise<void> {
  const log = await prisma.enrichmentLog.create({
    data: { type, status: 'RUNNING' },
  })

  try {
    switch (type) {
      case 'ABR':
        await runAbrEnrichment(log, signal)
        break
      case 'GOOGLE_PLACES':
        await runGooglePlacesEnrichment(log, signal)
        break
      case 'NOMINATIM':
        await runNominatimEnrichment(log, signal)
        break
    }
  } catch (err) {
    await prisma.enrichmentLog.update({
      where: { id: log.id },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        errors: JSON.stringify([err instanceof Error ? err.message : String(err)]),
      },
    })
  }
}

export async function startEnrichment(type: EnrichmentType): Promise<string[]> {
  const controller = new AbortController()

  if (type === 'ALL') {
    // Create a parent log to track overall progress
    const parentLog = await prisma.enrichmentLog.create({
      data: { type: 'ALL', status: 'RUNNING' },
    })
    activeControllers.set(parentLog.id, controller)

    // Run sequentially in background: ABR → Google → Nominatim
    const steps: Array<'ABR' | 'GOOGLE_PLACES' | 'NOMINATIM'> = [
      'ABR',
      'GOOGLE_PLACES',
      'NOMINATIM',
    ]

    ;(async () => {
      try {
        for (const step of steps) {
          if (controller.signal.aborted) break
          await prisma.enrichmentLog.update({
            where: { id: parentLog.id },
            data: { currentVenue: `Running ${step}...` },
          })
          await runSingleStep(step, controller.signal)
        }
        await prisma.enrichmentLog.update({
          where: { id: parentLog.id },
          data: {
            status: controller.signal.aborted ? 'CANCELLED' : 'COMPLETED',
            completedAt: new Date(),
          },
        })
      } catch {
        await prisma.enrichmentLog.update({
          where: { id: parentLog.id },
          data: { status: 'FAILED', completedAt: new Date() },
        })
      } finally {
        activeControllers.delete(parentLog.id)
      }
    })()

    return [parentLog.id]
  } else {
    // Single step, fire and forget
    const log = await prisma.enrichmentLog.create({
      data: { type, status: 'RUNNING' },
    })
    activeControllers.set(log.id, controller)

    ;(async () => {
      try {
        switch (type) {
          case 'ABR':
            await runAbrEnrichment(log, controller.signal)
            break
          case 'GOOGLE_PLACES':
            await runGooglePlacesEnrichment(log, controller.signal)
            break
          case 'NOMINATIM':
            await runNominatimEnrichment(log, controller.signal)
            break
        }
      } catch (err) {
        await prisma.enrichmentLog.update({
          where: { id: log.id },
          data: {
            status: 'FAILED',
            completedAt: new Date(),
            errors: JSON.stringify([err instanceof Error ? err.message : String(err)]),
          },
        })
      } finally {
        activeControllers.delete(log.id)
      }
    })()

    return [log.id]
  }
}

export function cancelEnrichment(id: string): boolean {
  const controller = activeControllers.get(id)
  if (controller) {
    controller.abort()
    activeControllers.delete(id)
    return true
  }
  return false
}
