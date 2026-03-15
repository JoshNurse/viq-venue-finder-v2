'use client'

import dynamic from 'next/dynamic'

const VenueMap = dynamic(() => import('@/components/venue-map'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-screen">
      <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
    </div>
  ),
})

export default function MapPage() {
  return <VenueMap />
}
