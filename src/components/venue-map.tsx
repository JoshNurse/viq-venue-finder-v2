'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
// import MarkerClusterGroup from 'react-leaflet-cluster'
import L from 'leaflet'
import Link from 'next/link'
import { Filter, Crosshair, X, Search, Building2, Hotel, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PIPELINE_STAGES, PIPELINE_STAGE_LABELS, PIPELINE_STAGE_COLORS } from '@/lib/constants'
import { haversineDistance, formatDistance } from '@/lib/geo'
import 'leaflet/dist/leaflet.css'

// Fix Leaflet default icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

const STAGE_MARKER_COLORS: Record<string, string> = {
  NOT_CONTACTED: '#F97316',
  VISITED: '#3B82F6',
  CONTACTED: '#6366F1',
  MEETING_SCHEDULED: '#A855F7',
  DEMO: '#EAB308',
  PROPOSAL: '#F97316',
  NEGOTIATION: '#EC4899',
  WON: '#22C55E',
  LOST: '#EF4444',
}

function createColoredIcon(color: string) {
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="background-color: ${color}; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 1px 3px rgba(0,0,0,0.3);"></div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  })
}

function LocationButton() {
  const map = useMap()

  const handleLocate = () => {
    map.locate({ setView: true, maxZoom: 13 })
  }

  return (
    <button
      onClick={handleLocate}
      className="absolute bottom-24 right-4 z-[1000] bg-white rounded-full p-3 shadow-lg border"
      title="My Location"
    >
      <Crosshair className="h-5 w-5" />
    </button>
  )
}

function MapSearch({ venues }: { venues: any[] }) {
  const map = useMap()
  const [query, setQuery] = useState('')
  const [showResults, setShowResults] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const results = useMemo(() => {
    if (!query.trim()) return []
    const q = query.toLowerCase()
    return venues
      .filter((v: any) => v.displayName?.toLowerCase().includes(q))
      .slice(0, 8)
  }, [query, venues])

  const handleSelect = useCallback((venue: any) => {
    setQuery(venue.displayName)
    setShowResults(false)
    map.flyTo([venue.latitude, venue.longitude], 15)

    setTimeout(() => {
      map.eachLayer((layer: any) => {
        if (layer instanceof L.Marker) {
          const pos = layer.getLatLng()
          if (
            Math.abs(pos.lat - venue.latitude) < 0.0001 &&
            Math.abs(pos.lng - venue.longitude) < 0.0001
          ) {
            layer.openPopup()
          }
        }
      })
    }, 1500)
  }, [map])

  const handleClear = () => {
    setQuery('')
    setShowResults(false)
    inputRef.current?.focus()
  }

  return (
    <div className="absolute top-14 left-4 right-16 z-[1000]">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setShowResults(true)
          }}
          onFocus={() => query && setShowResults(true)}
          placeholder="Search venues..."
          className="w-full pl-9 pr-8 py-2.5 bg-white rounded-xl shadow-lg border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        {query && (
          <button
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 rounded-full"
          >
            <X className="h-4 w-4 text-gray-400" />
          </button>
        )}
      </div>

      {showResults && results.length > 0 && (
        <div className="mt-1 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden max-h-[320px] overflow-y-auto">
          {results.map((venue: any) => (
            <button
              key={venue.id}
              onClick={() => handleSelect(venue)}
              className="w-full text-left px-3 py-2.5 hover:bg-gray-50 border-b border-gray-100 last:border-b-0 flex items-start gap-2"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{venue.displayName}</div>
                <div className="text-xs text-gray-500 truncate">
                  {venue.siteType} {venue.lgaRegion ? `• ${venue.lgaRegion}` : ''}
                </div>
              </div>
              <span
                className="mt-1 w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: STAGE_MARKER_COLORS[venue.pipelineStage] || '#9CA3AF' }}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function FitBoundsHelper({ venues }: { venues: any[] }) {
  const map = useMap()

  useEffect(() => {
    if (venues.length > 0) {
      const bounds = L.latLngBounds(
        venues.map((v: any) => [v.latitude, v.longitude])
      )
      map.fitBounds(bounds, { padding: [50, 50] })
    }
  }, [venues, map])

  return null
}

export default function VenueMap() {
  const [typeFilter, setTypeFilter] = useState('')
  const [stageFilter, setStageFilter] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [nearest20, setNearest20] = useState(false)
  const [nearest20Venues, setNearest20Venues] = useState<any[]>([])
  const [nearest20Loading, setNearest20Loading] = useState(false)

  const { data } = useQuery({
    queryKey: ['venues', 'map'],
    queryFn: async () => {
      const res = await fetch('/api/venues?limit=10000')
      return res.json()
    },
  })

  const allVenuesWithCoords = (data?.venues || []).filter((v: any) => v.latitude && v.longitude)

  const venues = nearest20
    ? nearest20Venues
    : allVenuesWithCoords.filter((v: any) => {
        if (typeFilter && v.siteType !== typeFilter) return false
        if (stageFilter && v.pipelineStage !== stageFilter) return false
        return true
      })

  const handleNearest20 = useCallback(() => {
    if (nearest20) {
      setNearest20(false)
      setNearest20Venues([])
      return
    }
    setNearest20Loading(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const userLat = pos.coords.latitude
        const userLon = pos.coords.longitude
        const sorted = [...allVenuesWithCoords]
          .map((v: any) => ({
            ...v,
            _distance: haversineDistance(userLat, userLon, v.latitude, v.longitude),
          }))
          .sort((a: any, b: any) => a._distance - b._distance)
          .slice(0, 20)
        setNearest20Venues(sorted)
        setNearest20(true)
        setNearest20Loading(false)
      },
      () => {
        setNearest20Loading(false)
        alert('Could not get your location. Please enable location services.')
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }, [nearest20, allVenuesWithCoords])

  return (
    <div className="relative h-screen">
      <MapContainer
        center={[-27.4698, 153.0251]}
        zoom={7}
        className="h-full w-full z-0"
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <LocationButton />
        <MapSearch venues={allVenuesWithCoords} />
        {nearest20 && nearest20Venues.length > 0 && (
          <FitBoundsHelper venues={nearest20Venues} />
        )}

        {venues.map((venue: any) => (
          <Marker
            key={venue.id}
            position={[venue.latitude, venue.longitude]}
            icon={createColoredIcon(STAGE_MARKER_COLORS[venue.pipelineStage] || '#9CA3AF')}
          >
            <Popup>
              <div className="min-w-[200px]">
                <h3 className="font-bold text-sm">{venue.displayName}</h3>
                <div className="text-xs text-gray-600 mt-1">
                  {venue.siteType} • {venue.approvedEgms} EGMs
                </div>
                {venue.lgaRegion && <div className="text-xs text-gray-500">{venue.lgaRegion}</div>}
                {venue._distance != null && (
                  <div className="text-xs text-blue-600 font-medium mt-0.5">
                    {formatDistance(venue._distance)}
                  </div>
                )}
                <div className="mt-1">
                  <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', PIPELINE_STAGE_COLORS[venue.pipelineStage as keyof typeof PIPELINE_STAGE_COLORS])}>
                    {PIPELINE_STAGE_LABELS[venue.pipelineStage as keyof typeof PIPELINE_STAGE_LABELS]}
                  </span>
                </div>
                <Link href={`/venues/${venue.id}`} className="text-blue-600 text-xs mt-2 block hover:underline">
                  View Details →
                </Link>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Nearest 20 Button */}
      <button
        onClick={handleNearest20}
        disabled={nearest20Loading}
        className={cn(
          'absolute top-4 left-4 z-[1000] rounded-full px-4 py-2 shadow-lg border flex items-center gap-2 text-sm font-medium',
          nearest20 ? 'bg-primary text-primary-foreground' : 'bg-white',
          nearest20Loading && 'opacity-50'
        )}
      >
        <MapPin className="h-4 w-4" />
        {nearest20Loading ? 'Locating...' : nearest20 ? 'Nearest 20 ✓' : 'Nearest 20'}
      </button>

      {/* Filter Button */}
      <button
        onClick={() => setShowFilters(true)}
        className="absolute top-4 right-4 z-[1000] bg-white rounded-full px-4 py-2 shadow-lg border flex items-center gap-2 text-sm font-medium"
      >
        <Filter className="h-4 w-4" />
        Filter
        {venues.length > 0 && <span className="text-xs text-muted-foreground">({venues.length})</span>}
      </button>

      {/* Filter Bottom Sheet */}
      {showFilters && (
        <div className="fixed inset-0 z-[1001] bg-black/50 flex items-end" onClick={() => setShowFilters(false)}>
          <div className="bg-white w-full rounded-t-2xl p-4 space-y-4 max-h-[60vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Filter Venues</h3>
              <button onClick={() => setShowFilters(false)}><X className="h-5 w-5" /></button>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Type</label>
              <div className="flex gap-2 mt-1">
                <button onClick={() => setTypeFilter('')} className={cn('px-3 py-1.5 rounded-full text-xs border', !typeFilter && 'bg-primary text-primary-foreground')}>All</button>
                <button onClick={() => setTypeFilter('CLUB')} className={cn('px-3 py-1.5 rounded-full text-xs border', typeFilter === 'CLUB' && 'bg-primary text-primary-foreground')}>Clubs</button>
                <button onClick={() => setTypeFilter('HOTEL')} className={cn('px-3 py-1.5 rounded-full text-xs border', typeFilter === 'HOTEL' && 'bg-primary text-primary-foreground')}>Hotels</button>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Pipeline Stage</label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                <button onClick={() => setStageFilter('')} className={cn('px-2 py-1 rounded-full text-xs border', !stageFilter && 'bg-primary text-primary-foreground')}>All</button>
                {PIPELINE_STAGES.map(s => (
                  <button
                    key={s}
                    onClick={() => setStageFilter(stageFilter === s ? '' : s)}
                    className={cn('px-2 py-1 rounded-full text-xs', stageFilter === s ? PIPELINE_STAGE_COLORS[s] : 'bg-secondary')}
                  >
                    {PIPELINE_STAGE_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
