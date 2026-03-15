'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Download, RefreshCw, Trash2, Plus, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function SettingsPage() {
  const queryClient = useQueryClient()
  const [newPos, setNewPos] = useState('')

  const { data: logs, isLoading: logsLoading } = useQuery({
    queryKey: ['import-logs'],
    queryFn: () => fetch('/api/import/logs').then(r => r.json()),
  })

  const { data: posOptions } = useQuery({
    queryKey: ['pos-options'],
    queryFn: () => fetch('/api/pos-options').then(r => r.json()),
  })

  const importMutation = useMutation({
    mutationFn: () => fetch('/api/import', { method: 'POST' }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['import-logs'] })
      queryClient.invalidateQueries({ queryKey: ['venues'] })
    },
  })

  const addPosMutation = useMutation({
    mutationFn: (name: string) =>
      fetch('/api/pos-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pos-options'] })
      setNewPos('')
    },
  })

  return (
    <div className="p-4 space-y-6 max-w-lg mx-auto">
      <h1 className="text-xl font-bold">Settings</h1>

      {/* CSV Import */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Venue Data Import</h2>
        <p className="text-sm text-muted-foreground">
          Import venue data from the Queensland Government gaming dataset.
        </p>
        <button
          onClick={() => importMutation.mutate()}
          disabled={importMutation.isPending}
          className={cn(
            'w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium text-sm transition-colors',
            importMutation.isPending
              ? 'bg-secondary text-muted-foreground'
              : 'bg-primary text-primary-foreground hover:bg-primary/90'
          )}
        >
          {importMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Importing...
            </>
          ) : (
            <>
              <Download className="h-4 w-4" />
              Import / Re-Pull CSV Data
            </>
          )}
        </button>

        {importMutation.isSuccess && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 text-green-700 text-sm">
            <CheckCircle className="h-4 w-4" />
            Import completed successfully!
          </div>
        )}

        {importMutation.isError && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
            <AlertCircle className="h-4 w-4" />
            Import failed. Check console for details.
          </div>
        )}

        {/* Import Logs */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Import History</h3>
          {logsLoading ? (
            <div className="text-sm text-muted-foreground">Loading...</div>
          ) : logs?.length === 0 ? (
            <div className="text-sm text-muted-foreground">No imports yet</div>
          ) : (
            <div className="space-y-2">
              {logs?.map((log: any) => (
                <div key={log.id} className="p-3 rounded-lg border text-sm space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">
                      {new Date(log.startedAt).toLocaleDateString()} {new Date(log.startedAt).toLocaleTimeString()}
                    </span>
                    <span className={cn(
                      'px-2 py-0.5 rounded-full text-xs font-medium',
                      log.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                      log.status === 'FAILED' ? 'bg-red-100 text-red-700' :
                      'bg-yellow-100 text-yellow-700'
                    )}>
                      {log.status}
                    </span>
                  </div>
                  <div className="text-muted-foreground">
                    {log.rowsProcessed} rows • {log.venuesCreated} created • {log.venuesUpdated} updated
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* POS Options Management */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">POS Systems</h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={newPos}
            onChange={(e) => setNewPos(e.target.value)}
            placeholder="Add new POS system..."
            className="flex-1 px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            onClick={() => newPos.trim() && addPosMutation.mutate(newPos.trim())}
            disabled={!newPos.trim()}
            className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {posOptions?.map((opt: any) => (
            <span
              key={opt.id}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium',
                opt.isDefault ? 'bg-secondary' : 'bg-blue-100 text-blue-700'
              )}
            >
              {opt.name}
            </span>
          ))}
        </div>
      </section>

      {/* CSV Export */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Export Data</h2>
        <button
          onClick={async () => {
            const res = await fetch('/api/venues?limit=10000')
            const data = await res.json()
            const csv = [
              ['Name', 'Type', 'LGA', 'Stage', 'POS', 'LMO', 'Phone', 'EGMs', 'ABN'].join(','),
              ...data.venues.map((v: any) => [
                `"${v.displayName}"`, v.siteType, `"${v.lgaRegion || ''}"`, v.pipelineStage,
                `"${v.posSystem || ''}"`, v.lmo || '', `"${v.venuePhone || ''}"`, v.approvedEgms, v.abn || ''
              ].join(','))
            ].join('\n')
            const blob = new Blob([csv], { type: 'text/csv' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `viq-venues-${new Date().toISOString().split('T')[0]}.csv`
            a.click()
          }}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border font-medium text-sm hover:bg-secondary transition-colors"
        >
          <Download className="h-4 w-4" />
          Export Venues CSV
        </button>
      </section>
    </div>
  )
}
