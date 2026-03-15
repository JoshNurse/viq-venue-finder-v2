'use client'

import { useState, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { Search, Filter, Building2, Hotel, X, MapPin, Phone, CheckSquare, Square, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PIPELINE_STAGES, PIPELINE_STAGE_LABELS, PIPELINE_STAGE_COLORS } from '@/lib/constants'
import { haversineDistance, formatDistance } from '@/lib/geo'

interface Venue {
  id: string
  displayName: string
  siteType: string
  approvedEgms: number
  operationalEgms: number | null
  pipelineStage: string
  lgaRegion: string | null
  sa2Region: string | null
  posSystem: string | null
  lmo: string | null
  isActive: boolean
  latitude: number | null
  longitude: number | null
  googlePhone: string | null
  venuePhone: string | null
  activities: { createdAt: string; type: string }[]
}

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export default function VenuesPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [stageFilter, setStageFilter] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [page, setPage] = useState(1)
  const [nearbySort, setNearbySort] = useState(false)
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null)
  const [locationLoading, setLocationLoading] = useState(false)

  // Multi-select state
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkStage, setBulkStage] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['venues', search, typeFilter, stageFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (typeFilter) params.set('type', typeFilter)
      if (stageFilter) params.set('stage', stageFilter)
      params.set('page', page.toString())
      params.set('limit', nearbySort ? '200' : '50')
      const res = await fetch(`/api/venues?${params}`)
      return res.json()
    },
  })

  const handleNearbyToggle = useCallback(() => {
    if (nearbySort) {
      setNearbySort(false)
      return
    }
    setLocationLoading(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude })
        setNearbySort(true)
        setLocationLoading(false)
      },
      () => {
        setLocationLoading(false)
        alert('Could not get your location. Please enable location services.')
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }, [nearbySort])

  const sortedVenues = useMemo(() => {
    const venues = data?.venues || []
    if (!nearbySort || !userLocation) return venues

    return [...venues]
      .map((v: Venue) => ({
        ...v,
        _distance: v.latitude && v.longitude
          ? haversineDistance(userLocation.lat, userLocation.lon, v.latitude, v.longitude)
          : Infinity,
      }))
      .sort((a: any, b: any) => a._distance - b._distance)
  }, [data?.venues, nearbySort, userLocation])

  const bulkUpdate = useMutation({
    mutationFn: async ({ ids, pipelineStage }: { ids: string[]; pipelineStage: string }) => {
      const res = await fetch('/api/venues/bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, pipelineStage }),
      })
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['venues'] })
      setSelectMode(false)
      setSelectedIds(new Set())
      setBulkStage('')
    },
  })

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleLongPress = (id: string) => {
    if (!selectMode) {
      setSelectMode(true)
      setSelectedIds(new Set([id]))
    }
  }

  const cancelSelection = () => {
    setSelectMode(false)
    setSelectedIds(new Set())
    setBulkStage('')
  }

  const handleBulkMove = () => {
    if (!bulkStage || selectedIds.size === 0) return
    bulkUpdate.mutate({ ids: Array.from(selectedIds), pipelineStage: bulkStage })
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Venues</h1>
          <div className="flex items-center gap-2">
            {!selectMode && (
              <button
                onClick={() => setSelectMode(true)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium border bg-secondary hover:bg-secondary/80 transition-colors"
              >
                Select
              </button>
            )}
            <span className="text-sm text-muted-foreground">
              {data?.total ?? '...'} venues
            </span>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search venues..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="w-full pl-10 pr-4 py-2 rounded-lg border bg-secondary/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* Filter toggle */}
        <div className="flex gap-2 items-center">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              'flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
              showFilters ? 'bg-primary text-primary-foreground' : 'bg-secondary'
            )}
          >
            <Filter className="h-3 w-3" />
            Filters
          </button>

          <button
            onClick={handleNearbyToggle}
            disabled={locationLoading}
            className={cn(
              'flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
              nearbySort ? 'bg-primary text-primary-foreground' : 'bg-secondary',
              locationLoading && 'opacity-50'
            )}
          >
            <MapPin className="h-3 w-3" />
            {locationLoading ? 'Locating...' : 'Nearby'}
          </button>

          {typeFilter && (
            <button
              onClick={() => setTypeFilter('')}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700"
            >
              {typeFilter} <X className="h-3 w-3" />
            </button>
          )}
          {stageFilter && (
            <button
              onClick={() => setStageFilter('')}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700"
            >
              {PIPELINE_STAGE_LABELS[stageFilter as keyof typeof PIPELINE_STAGE_LABELS]} <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Filter panel */}
        {showFilters && (
          <div className="space-y-3 pt-2 border-t">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Type</label>
              <div className="flex gap-2 mt-1">
                {['CLUB', 'HOTEL'].map(t => (
                  <button
                    key={t}
                    onClick={() => { setTypeFilter(typeFilter === t ? '' : t); setPage(1) }}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                      typeFilter === t ? 'bg-primary text-primary-foreground' : 'bg-secondary'
                    )}
                  >
                    {t === 'CLUB' ? <span className="flex items-center gap-1"><Building2 className="h-3 w-3" /> Club</span> : <span className="flex items-center gap-1"><Hotel className="h-3 w-3" /> Hotel</span>}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Pipeline Stage</label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {PIPELINE_STAGES.map(s => (
                  <button
                    key={s}
                    onClick={() => { setStageFilter(stageFilter === s ? '' : s); setPage(1) }}
                    className={cn(
                      'px-2 py-1 rounded-full text-xs font-medium transition-colors',
                      stageFilter === s ? PIPELINE_STAGE_COLORS[s] : 'bg-secondary text-secondary-foreground'
                    )}
                  >
                    {PIPELINE_STAGE_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Venue List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : sortedVenues?.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            No venues found
          </div>
        ) : (
          <div className="divide-y">
            {sortedVenues?.map((venue: any) => {
              const phone = venue.googlePhone || venue.venuePhone
              const lastActivity = venue.activities?.[0]?.createdAt
              const distance = venue._distance != null && venue._distance !== Infinity
                ? venue._distance
                : null

              return (
                <div
                  key={venue.id}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 transition-colors',
                    selectMode ? 'cursor-pointer' : '',
                    selectedIds.has(venue.id) ? 'bg-primary/5' : 'hover:bg-secondary/50'
                  )}
                  onClick={() => {
                    if (selectMode) toggleSelect(venue.id)
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    handleLongPress(venue.id)
                  }}
                >
                  {selectMode && (
                    <div className="flex-shrink-0">
                      {selectedIds.has(venue.id) ? (
                        <CheckSquare className="h-5 w-5 text-primary" />
                      ) : (
                        <Square className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                  )}

                  {selectMode ? (
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="flex-shrink-0">
                        {venue.siteType === 'CLUB' ? (
                          <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                            <Building2 className="h-5 w-5 text-blue-600" />
                          </div>
                        ) : (
                          <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center">
                            <Hotel className="h-5 w-5 text-amber-600" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{venue.displayName}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground">{venue.lgaRegion}</span>
                          <span className="text-xs text-muted-foreground">• {venue.approvedEgms} EGMs</span>
                        </div>
                      </div>
                      <div className="flex-shrink-0">
                        <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', PIPELINE_STAGE_COLORS[venue.pipelineStage as keyof typeof PIPELINE_STAGE_COLORS] || 'bg-gray-100')}>
                          {PIPELINE_STAGE_LABELS[venue.pipelineStage as keyof typeof PIPELINE_STAGE_LABELS] || venue.pipelineStage}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <>
                      <Link
                        href={`/venues/${venue.id}`}
                        className="flex items-center gap-3 flex-1 min-w-0"
                      >
                        <div className="flex-shrink-0">
                          {venue.siteType === 'CLUB' ? (
                            <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                              <Building2 className="h-5 w-5 text-blue-600" />
                            </div>
                          ) : (
                            <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center">
                              <Hotel className="h-5 w-5 text-amber-600" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{venue.displayName}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-muted-foreground">{venue.lgaRegion}</span>
                            <span className="text-xs text-muted-foreground">• {venue.approvedEgms} EGMs</span>
                            {distance != null && (
                              <span className="text-xs text-blue-600 font-medium">• {formatDistance(distance)}</span>
                            )}
                          </div>
                          {lastActivity && (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              Last activity: {timeAgo(lastActivity)}
                            </div>
                          )}
                        </div>
                      </Link>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        {phone && (
                          <a
                            href={`tel:${phone}`}
                            onClick={(e) => e.stopPropagation()}
                            className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center"
                            title={phone}
                          >
                            <Phone className="h-4 w-4 text-green-600" />
                          </a>
                        )}
                        <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', PIPELINE_STAGE_COLORS[venue.pipelineStage as keyof typeof PIPELINE_STAGE_COLORS] || 'bg-gray-100')}>
                          {PIPELINE_STAGE_LABELS[venue.pipelineStage as keyof typeof PIPELINE_STAGE_LABELS] || venue.pipelineStage}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Pagination */}
        {data && data.totalPages > 1 && (
          <div className="flex justify-center gap-2 py-4">
            <button
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
              className="px-3 py-1.5 rounded border text-sm disabled:opacity-50"
            >
              Previous
            </button>
            <span className="px-3 py-1.5 text-sm text-muted-foreground">
              Page {page} of {data.totalPages}
            </span>
            <button
              disabled={page === data.totalPages}
              onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 rounded border text-sm disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Bulk Action Bar */}
      {selectMode && (
        <div className="sticky bottom-16 left-0 right-0 z-40 bg-white border-t shadow-lg px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium whitespace-nowrap">
              {selectedIds.size} selected
            </span>
            <select
              value={bulkStage}
              onChange={(e) => setBulkStage(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg border text-sm"
            >
              <option value="">Move to...</option>
              {PIPELINE_STAGES.map(s => (
                <option key={s} value={s}>{PIPELINE_STAGE_LABELS[s]}</option>
              ))}
            </select>
            <button
              onClick={handleBulkMove}
              disabled={!bulkStage || selectedIds.size === 0 || bulkUpdate.isPending}
              className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 flex items-center gap-1"
            >
              <Check className="h-4 w-4" />
              {bulkUpdate.isPending ? 'Moving...' : 'Apply'}
            </button>
            <button
              onClick={cancelSelection}
              className="px-3 py-2 rounded-lg border text-sm font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
