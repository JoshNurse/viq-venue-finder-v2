'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { Building2, Hotel, X, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  PIPELINE_STAGES, PIPELINE_STAGE_LABELS, PIPELINE_STAGE_COLORS,
  NOTE_REQUIRED_STAGES,
} from '@/lib/constants'

interface Venue {
  id: string
  displayName: string
  siteType: string
  approvedEgms: number
  lgaRegion: string | null
  pipelineStage: string
}

export default function PipelinePage() {
  const queryClient = useQueryClient()
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null)

  // Stage change note modal state
  const [pendingMove, setPendingMove] = useState<{ venueId: string; stage: string } | null>(null)
  const [stageChangeNote, setStageChangeNote] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['venues', 'pipeline'],
    queryFn: async () => {
      const res = await fetch('/api/venues?limit=10000')
      return res.json()
    },
  })

  const moveVenue = useMutation({
    mutationFn: async ({ venueId, stage, stageChangeNote }: { venueId: string; stage: string; stageChangeNote?: string }) => {
      const body: any = { pipelineStage: stage }
      if (stageChangeNote) body.stageChangeNote = stageChangeNote
      const res = await fetch(`/api/venues/${venueId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['venues'] })
      setSelectedVenue(null)
      setPendingMove(null)
      setStageChangeNote('')
    },
  })

  const handleMoveToStage = (venueId: string, stage: string) => {
    if (NOTE_REQUIRED_STAGES.includes(stage as any)) {
      setPendingMove({ venueId, stage })
      setStageChangeNote('')
    } else {
      moveVenue.mutate({ venueId, stage })
    }
  }

  const confirmStageMove = () => {
    if (!pendingMove || !stageChangeNote.trim()) return
    moveVenue.mutate({
      venueId: pendingMove.venueId,
      stage: pendingMove.stage,
      stageChangeNote: stageChangeNote.trim(),
    })
  }

  const venuesByStage = PIPELINE_STAGES.reduce((acc, stage) => {
    acc[stage] = data?.venues?.filter((v: Venue) => v.pipelineStage === stage) || []
    return acc
  }, {} as Record<string, Venue[]>)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col">
      <div className="px-4 py-3 border-b bg-white">
        <h1 className="text-xl font-bold">Pipeline</h1>
        <p className="text-sm text-muted-foreground">{data?.total || 0} total venues</p>
      </div>

      {/* Kanban Board - horizontal scroll */}
      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-3 p-4 min-w-max h-full">
          {PIPELINE_STAGES.map(stage => (
            <div key={stage} className="w-72 flex-shrink-0 flex flex-col bg-secondary/30 rounded-lg">
              {/* Column Header */}
              <div className="p-3 border-b">
                <div className="flex items-center justify-between">
                  <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', PIPELINE_STAGE_COLORS[stage])}>
                    {PIPELINE_STAGE_LABELS[stage]}
                  </span>
                  <span className="text-xs text-muted-foreground font-medium">
                    {venuesByStage[stage].length}
                  </span>
                </div>
              </div>

              {/* Cards */}
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {venuesByStage[stage].map((venue: Venue) => (
                  <div
                    key={venue.id}
                    className="bg-white rounded-lg border p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => setSelectedVenue(venue)}
                  >
                    <Link
                      href={`/venues/${venue.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="font-medium text-sm text-primary hover:underline block truncate"
                    >
                      {venue.displayName}
                    </Link>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      {venue.siteType === 'CLUB' ? (
                        <Building2 className="h-3 w-3" />
                      ) : (
                        <Hotel className="h-3 w-3" />
                      )}
                      <span>{venue.siteType}</span>
                      <span>• {venue.approvedEgms} EGMs</span>
                    </div>
                    {venue.lgaRegion && (
                      <div className="text-xs text-muted-foreground mt-0.5 truncate">{venue.lgaRegion}</div>
                    )}
                  </div>
                ))}
                {venuesByStage[stage].length === 0 && (
                  <div className="text-center py-8 text-xs text-muted-foreground">
                    No venues
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Move-to Bottom Sheet */}
      {selectedVenue && !pendingMove && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={() => setSelectedVenue(null)}>
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-semibold">{selectedVenue.displayName}</h3>
                <p className="text-xs text-muted-foreground">Move to stage...</p>
              </div>
              <button onClick={() => setSelectedVenue(null)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-1">
              {PIPELINE_STAGES.map(stage => (
                <button
                  key={stage}
                  onClick={() => handleMoveToStage(selectedVenue.id, stage)}
                  disabled={selectedVenue.pipelineStage === stage || moveVenue.isPending}
                  className={cn(
                    'w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-colors',
                    selectedVenue.pipelineStage === stage
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'hover:bg-secondary'
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span className={cn('w-2 h-2 rounded-full', PIPELINE_STAGE_COLORS[stage].split(' ')[0])} />
                    {PIPELINE_STAGE_LABELS[stage]}
                  </span>
                  {selectedVenue.pipelineStage === stage && <span className="text-xs">Current</span>}
                  {selectedVenue.pipelineStage !== stage && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Stage Change Note Modal */}
      {pendingMove && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center">
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">Stage Change Note Required</h3>
              <button onClick={() => { setPendingMove(null); setStageChangeNote('') }}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-sm text-muted-foreground">
              Moving to <span className="font-medium text-foreground">{PIPELINE_STAGE_LABELS[pendingMove.stage as keyof typeof PIPELINE_STAGE_LABELS]}</span> requires a note explaining the transition.
            </p>

            <textarea
              value={stageChangeNote}
              onChange={(e) => setStageChangeNote(e.target.value)}
              placeholder="Explain why this venue is moving to this stage..."
              rows={4}
              className="w-full px-3 py-2 rounded-lg border text-sm resize-none"
              autoFocus
            />

            <div className="flex gap-2">
              <button
                onClick={() => { setPendingMove(null); setStageChangeNote('') }}
                className="flex-1 py-3 rounded-lg border font-medium text-sm"
              >
                Cancel
              </button>
              <button
                onClick={confirmStageMove}
                disabled={!stageChangeNote.trim() || moveVenue.isPending}
                className="flex-1 py-3 rounded-lg bg-primary text-primary-foreground font-medium text-sm disabled:opacity-50"
              >
                {moveVenue.isPending ? 'Saving...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
