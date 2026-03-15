'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Building2, Hotel, TrendingUp, BarChart3, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PIPELINE_STAGE_LABELS, PIPELINE_STAGE_COLORS } from '@/lib/constants'

type DateRange = 'week' | 'month' | 'quarter' | 'all'

function getDateRange(range: DateRange): { from?: string; to?: string } {
  if (range === 'all') return {}
  const now = new Date()
  const to = now.toISOString().split('T')[0]
  let from: Date

  switch (range) {
    case 'week': {
      from = new Date(now)
      const day = from.getDay()
      from.setDate(from.getDate() - (day === 0 ? 6 : day - 1)) // Monday
      break
    }
    case 'month':
      from = new Date(now.getFullYear(), now.getMonth(), 1)
      break
    case 'quarter': {
      const quarterMonth = Math.floor(now.getMonth() / 3) * 3
      from = new Date(now.getFullYear(), quarterMonth, 1)
      break
    }
    default:
      return {}
  }

  return { from: from.toISOString().split('T')[0], to }
}

const DATE_RANGE_LABELS: Record<DateRange, string> = {
  week: 'This Week',
  month: 'This Month',
  quarter: 'This Quarter',
  all: 'All Time',
}

export default function DashboardPage() {
  const [dateRange, setDateRange] = useState<DateRange>('all')
  const { from, to } = getDateRange(dateRange)

  const { data, isLoading } = useQuery({
    queryKey: ['stats', dateRange],
    queryFn: () => {
      const params = new URLSearchParams()
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      const qs = params.toString()
      return fetch(`/api/stats${qs ? `?${qs}` : ''}`).then(r => r.json())
    },
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!data) return null

  const maxStageCount = Math.max(...(data.byStage?.map((s: any) => s._count) || [1]))
  const egmCoverage = data.totalEgms > 0 ? ((data.wonEgms / data.totalEgms) * 100).toFixed(1) : '0'

  return (
    <div className="p-4 space-y-6 max-w-2xl mx-auto pb-20">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Dashboard</h1>
      </div>

      {/* Date Range Filter */}
      <div className="flex gap-1.5 bg-secondary/50 rounded-lg p-1">
        {(['week', 'month', 'quarter', 'all'] as DateRange[]).map(range => (
          <button
            key={range}
            onClick={() => setDateRange(range)}
            className={cn(
              'flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors',
              dateRange === range
                ? 'bg-white shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {DATE_RANGE_LABELS[range]}
          </button>
        ))}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white border rounded-lg p-4">
          <div className="text-2xl font-bold">{data.activeVenues}</div>
          <div className="text-xs text-muted-foreground">Active Venues</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-2xl font-bold">{data.totalEgms?.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">Total EGMs</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-2xl font-bold text-green-600">{egmCoverage}%</div>
          <div className="text-xs text-muted-foreground">EGM Coverage (Won)</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-2xl font-bold">{data.wonEgms?.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">Won EGMs</div>
        </div>
      </div>

      {/* Pipeline Funnel */}
      <section className="bg-white border rounded-lg p-4">
        <h2 className="font-semibold mb-3 flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Pipeline</h2>
        <div className="space-y-2">
          {data.byStage?.sort((a: any, b: any) => {
            const order = ['NOT_CONTACTED', 'VISITED', 'CONTACTED', 'MEETING_SCHEDULED', 'DEMO', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST']
            return order.indexOf(a.pipelineStage) - order.indexOf(b.pipelineStage)
          }).map((s: any) => (
            <div key={s.pipelineStage} className="flex items-center gap-2">
              <span className="text-xs w-28 truncate text-right text-muted-foreground">
                {PIPELINE_STAGE_LABELS[s.pipelineStage as keyof typeof PIPELINE_STAGE_LABELS]}
              </span>
              <div className="flex-1 h-6 bg-secondary rounded-full overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all', PIPELINE_STAGE_COLORS[s.pipelineStage as keyof typeof PIPELINE_STAGE_COLORS]?.split(' ')[0] || 'bg-gray-300')}
                  style={{ width: `${(s._count / maxStageCount) * 100}%` }}
                />
              </div>
              <span className="text-sm font-medium w-10 text-right">{s._count}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Activity Counts */}
      {data.activityCounts?.length > 0 && (
        <section className="bg-white border rounded-lg p-4">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Activity Summary
            {dateRange !== 'all' && <span className="text-xs font-normal text-muted-foreground">({DATE_RANGE_LABELS[dateRange]})</span>}
          </h2>
          <div className="grid grid-cols-3 gap-2">
            {data.activityCounts.map((a: any) => (
              <div key={a.type} className="text-center p-2 bg-secondary/50 rounded-lg">
                <div className="text-lg font-bold">{a._count}</div>
                <div className="text-xs text-muted-foreground">{a.type}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Type Breakdown */}
      <section className="bg-white border rounded-lg p-4">
        <h2 className="font-semibold mb-3 flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Venue Types</h2>
        <div className="flex gap-4">
          {data.byType?.map((t: any) => (
            <div key={t.siteType} className="flex-1 text-center p-3 bg-secondary/50 rounded-lg">
              {t.siteType === 'CLUB' ? <Building2 className="h-6 w-6 mx-auto text-blue-600" /> : <Hotel className="h-6 w-6 mx-auto text-amber-600" />}
              <div className="text-xl font-bold mt-1">{t._count}</div>
              <div className="text-xs text-muted-foreground">{t.siteType === 'CLUB' ? 'Clubs' : 'Hotels'}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Top Regions */}
      <section className="bg-white border rounded-lg p-4">
        <h2 className="font-semibold mb-3">Top Regions</h2>
        <div className="space-y-1.5">
          {data.byRegion?.slice(0, 10).map((r: any) => (
            <div key={r.lgaRegion} className="flex items-center justify-between text-sm">
              <span className="truncate">{r.lgaRegion || 'Unknown'}</span>
              <span className="font-medium text-muted-foreground">{r._count}</span>
            </div>
          ))}
        </div>
      </section>

      {/* POS Market Share */}
      {data.byPos?.length > 0 && (
        <section className="bg-white border rounded-lg p-4">
          <h2 className="font-semibold mb-3">POS Systems</h2>
          <div className="space-y-1.5">
            {data.byPos?.map((p: any) => (
              <div key={p.posSystem} className="flex items-center justify-between text-sm">
                <span>{p.posSystem}</span>
                <span className="font-medium text-muted-foreground">{p._count}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* LMO Split */}
      {data.byLmo?.length > 0 && (
        <section className="bg-white border rounded-lg p-4">
          <h2 className="font-semibold mb-3">LMO Split</h2>
          <div className="flex gap-4">
            {data.byLmo?.map((l: any) => (
              <div key={l.lmo} className="flex-1 text-center p-3 bg-secondary/50 rounded-lg">
                <div className="text-xl font-bold">{l._count}</div>
                <div className="text-xs text-muted-foreground">{l.lmo === 'MAXGAMING' ? 'MaxGaming' : 'Odyssey'}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recent Activity */}
      <section className="bg-white border rounded-lg p-4">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <Users className="h-4 w-4" />
          Recent Activity
          {dateRange !== 'all' && <span className="text-xs font-normal text-muted-foreground">({DATE_RANGE_LABELS[dateRange]})</span>}
        </h2>
        {data.recentActivities?.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recent activity</p>
        ) : (
          <div className="space-y-2">
            {data.recentActivities?.map((a: any) => (
              <div key={a.id} className="flex items-start gap-2 text-sm">
                <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                <div>
                  <span className="font-medium">{a.venue?.displayName}</span>
                  <span className="text-muted-foreground"> — {a.type}: {a.note || '(no note)'}</span>
                  <div className="text-xs text-muted-foreground">
                    {new Date(a.createdAt).toLocaleDateString()} {new Date(a.createdAt).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
