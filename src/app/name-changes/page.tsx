'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { ArrowRight, ArrowLeft } from 'lucide-react'

export default function NameChangesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['name-changes'],
    queryFn: async () => {
      const res = await fetch('/api/name-changes')
      return res.json()
    },
  })

  return (
    <div className="flex flex-col h-screen">
      <div className="sticky top-0 z-10 bg-white border-b p-4">
        <div className="flex items-center gap-3">
          <Link href="/venues" className="p-1">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold">Name Changes</h1>
            <p className="text-sm text-muted-foreground">
              {data?.total ?? '...'} venues renamed
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : (
          <div className="divide-y">
            {data?.changes?.map((v: any) => (
              <Link
                key={v.id}
                href={`/venues/${v.id}`}
                className="block px-4 py-3 hover:bg-secondary/50 transition-colors"
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground line-through truncate">
                      {v.siteName}
                    </div>
                    <div className="font-medium text-sm flex items-center gap-1.5 mt-0.5">
                      <ArrowRight className="h-3 w-3 text-green-600 flex-shrink-0" />
                      <span className="truncate">{v.displayName}</span>
                    </div>
                    {v.businessName && v.businessName !== v.displayName && (
                      <div className="text-xs text-blue-600 mt-0.5">
                        Business: {v.businessName}
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
