'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, MapPin, Phone, Mail, StickyNote, PhoneCall,
  Calendar, Navigation, Plus, X, Building2, Hotel,
  Clock, ExternalLink, Globe, Star, CalendarDays,
  Circle, Pencil, History, FileText,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  PIPELINE_STAGES, PIPELINE_STAGE_LABELS, PIPELINE_STAGE_COLORS,
  CONTACT_ROLES, CONTACT_ROLE_LABELS, LMO_OPTIONS,
  TASK_TYPES, TASK_TYPE_LABELS, NOTE_REQUIRED_STAGES,
} from '@/lib/constants'

const ACTIVITY_TYPE_CONFIG: Record<string, { icon: any; label: string; color: string }> = {
  NOTE: { icon: StickyNote, label: 'Note', color: 'text-gray-600' },
  CALL: { icon: PhoneCall, label: 'Call', color: 'text-blue-600' },
  EMAIL: { icon: Mail, label: 'Email', color: 'text-green-600' },
  VISIT: { icon: MapPin, label: 'Visit', color: 'text-purple-600' },
  STAGE_CHANGE: { icon: Calendar, label: 'Stage Change', color: 'text-orange-600' },
  DATA_IMPORT: { icon: Building2, label: 'Import', color: 'text-gray-400' },
  DATA_EDIT: { icon: Pencil, label: 'Edit', color: 'text-cyan-600' },
}

interface Task {
  id: string
  type: string
  dueDate: string
  note: string | null
  completed: boolean
  venue: { id: string; displayName: string }
}

type Tab = 'details' | 'history'

function ContactCard({ role, contact, onSave }: { role: string; contact: any; onSave: (data: any) => void }) {
  const hasData = contact?.name || contact?.email || contact?.mobile
  const [expanded, setExpanded] = useState(!!hasData)

  if (!hasData && !expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="w-full text-left px-3 py-2 rounded-lg border border-dashed text-sm text-muted-foreground hover:bg-secondary/50 transition-colors"
      >
        + {CONTACT_ROLE_LABELS[role as keyof typeof CONTACT_ROLE_LABELS]}
      </button>
    )
  }

  return (
    <div className="border rounded-lg p-3 space-y-2">
      <h3 className="text-sm font-medium">{CONTACT_ROLE_LABELS[role as keyof typeof CONTACT_ROLE_LABELS]}</h3>
      <input
        type="text"
        defaultValue={contact?.name || ''}
        onBlur={(e) => onSave({ role, name: e.target.value, email: contact?.email, mobile: contact?.mobile })}
        placeholder="Name"
        className="w-full px-3 py-1.5 rounded border text-sm"
      />
      <div className="flex items-center gap-1">
        <input
          type="email"
          defaultValue={contact?.email || ''}
          onBlur={(e) => onSave({ role, name: contact?.name, email: e.target.value, mobile: contact?.mobile })}
          placeholder="Email"
          className="flex-1 px-3 py-1.5 rounded border text-sm"
        />
        {contact?.email && (
          <a href={`mailto:${contact.email}`} className="p-1.5 rounded-full bg-blue-100 text-blue-600 flex-shrink-0">
            <Mail className="h-4 w-4" />
          </a>
        )}
      </div>
      <div className="flex items-center gap-1">
        <input
          type="tel"
          defaultValue={contact?.mobile || ''}
          onBlur={(e) => onSave({ role, name: contact?.name, email: contact?.email, mobile: e.target.value })}
          placeholder="Mobile"
          className="flex-1 px-3 py-1.5 rounded border text-sm"
        />
        {contact?.mobile && (
          <a href={`tel:${contact.mobile}`} className="p-1.5 rounded-full bg-green-100 text-green-600 flex-shrink-0">
            <Phone className="h-4 w-4" />
          </a>
        )}
      </div>
    </div>
  )
}

export default function VenueDetailPage() {
  const params = useParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const venueId = params.id as string

  const [activeTab, setActiveTab] = useState<Tab>('details')
  const [showActivityModal, setShowActivityModal] = useState(false)
  const [activityType, setActivityType] = useState<string>('NOTE')
  const [activityNote, setActivityNote] = useState('')
  const [showAddPos, setShowAddPos] = useState(false)
  const [newPosName, setNewPosName] = useState('')
  const [showTaskModal, setShowTaskModal] = useState(false)
  const [taskType, setTaskType] = useState<string>('FOLLOW_UP')
  const [taskDueDate, setTaskDueDate] = useState('')
  const [taskNote, setTaskNote] = useState('')
  const [pendingStageChange, setPendingStageChange] = useState<string | null>(null)
  const [stageChangeNote, setStageChangeNote] = useState('')
  const [showReenrichPrompt, setShowReenrichPrompt] = useState(false)

  // Editable business info state
  const [editingField, setEditingField] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  const { data: venue, isLoading } = useQuery({
    queryKey: ['venue', venueId],
    queryFn: () => fetch(`/api/venues/${venueId}`).then(r => r.json()),
  })

  const { data: posOptions } = useQuery({
    queryKey: ['pos-options'],
    queryFn: () => fetch('/api/pos-options').then(r => r.json()),
  })

  const { data: tasksData } = useQuery({
    queryKey: ['tasks', 'venue', venueId],
    queryFn: () => fetch(`/api/tasks?venueId=${venueId}&completed=false`).then(r => r.json()),
  })

  const updateVenue = useMutation({
    mutationFn: (data: any) =>
      fetch(`/api/venues/${venueId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => r.json()),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['venue', venueId] })
      queryClient.invalidateQueries({ queryKey: ['venues'] })
      setEditingField(null)
      if (variables.displayName !== undefined) {
        setShowReenrichPrompt(true)
      }
    },
  })

  const reenrichVenue = useMutation({
    mutationFn: () =>
      fetch(`/api/venues/${venueId}/enrich`, {
        method: 'POST',
      }).then(r => {
        if (!r.ok) return r.json().then(e => Promise.reject(e))
        return r.json()
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['venue', venueId] })
      queryClient.invalidateQueries({ queryKey: ['venues'] })
      setShowReenrichPrompt(false)
    },
    onError: () => {
      setShowReenrichPrompt(false)
    },
  })

  const updateContact = useMutation({
    mutationFn: (data: any) =>
      fetch(`/api/venues/${venueId}/contacts`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['venue', venueId] }),
  })

  const addActivity = useMutation({
    mutationFn: (data: { type: string; note: string }) =>
      fetch(`/api/venues/${venueId}/activities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['venue', venueId] })
      setShowActivityModal(false)
      setActivityNote('')
    },
  })

  const addPosOption = useMutation({
    mutationFn: (name: string) =>
      fetch('/api/pos-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      }).then(r => r.json()),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['pos-options'] })
      updateVenue.mutate({ posSystem: data.name })
      setShowAddPos(false)
      setNewPosName('')
    },
  })

  const createTask = useMutation({
    mutationFn: (data: { venueId: string; type: string; dueDate: string; note?: string }) =>
      fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      setShowTaskModal(false)
      setTaskType('FOLLOW_UP')
      setTaskDueDate('')
      setTaskNote('')
    },
  })

  const toggleTaskComplete = useMutation({
    mutationFn: async ({ id, completed }: { id: string; completed: boolean }) => {
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed }),
      })
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['task-overdue-count'] })
    },
  })

  const handleStageChange = (newStage: string) => {
    if (NOTE_REQUIRED_STAGES.includes(newStage as any)) {
      setPendingStageChange(newStage)
      setStageChangeNote('')
    } else {
      updateVenue.mutate({ pipelineStage: newStage })
    }
  }

  const confirmStageChange = () => {
    if (!pendingStageChange || !stageChangeNote.trim()) return
    updateVenue.mutate({ pipelineStage: pendingStageChange, stageChangeNote: stageChangeNote.trim() })
    setPendingStageChange(null)
    setStageChangeNote('')
  }

  const startEditing = (field: string, currentValue: string | null) => {
    setEditingField(field)
    setEditValue(currentValue || '')
  }

  const saveEdit = (field: string) => {
    updateVenue.mutate({ [field]: editValue || null })
  }

  const cancelEdit = () => {
    setEditingField(null)
    setEditValue('')
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!venue || venue.error) {
    return (
      <div className="p-4 text-center">
        <p className="text-muted-foreground">Venue not found</p>
        <button onClick={() => router.back()} className="mt-4 text-primary">Go back</button>
      </div>
    )
  }

  const getContact = (role: string) => venue.contacts?.find((c: any) => c.role === role)
  const venueTasks: Task[] = tasksData?.tasks || []

  const getDefaultDueDate = () => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    return tomorrow.toISOString().split('T')[0]
  }

  const primaryPhone = venue.googlePhone || venue.venuePhone
  const contactEmail = venue.contacts?.find((c: any) => c.email)?.email

  const handleLogCall = () => {
    if (primaryPhone) {
      window.open(`tel:${primaryPhone}`, '_self')
    }
    setActivityType('CALL')
    setActivityNote('')
    setShowActivityModal(true)
  }

  // Editable field component
  const EditableField = ({ label, field, value }: { label: string; field: string; value: string | null }) => {
    const isEditing = editingField === field
    return (
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <span className="text-muted-foreground text-xs">{label}:</span>{' '}
          {isEditing ? (
            <div className="flex items-center gap-1 mt-1">
              <input
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="flex-1 px-2 py-1 rounded border text-sm"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveEdit(field)
                  if (e.key === 'Escape') cancelEdit()
                }}
              />
              <button onClick={() => saveEdit(field)} className="px-2 py-1 rounded bg-primary text-primary-foreground text-xs">Save</button>
              <button onClick={cancelEdit} className="px-2 py-1 rounded border text-xs">Cancel</button>
            </div>
          ) : (
            <span className="text-sm">{value || <span className="text-muted-foreground italic">Not set</span>}</span>
          )}
        </div>
        {!isEditing && (
          <button
            onClick={() => startEditing(field, value)}
            className="p-1 rounded hover:bg-secondary flex-shrink-0 mt-0.5"
            title="Edit"
          >
            <Pencil className="h-3 w-3 text-muted-foreground" />
          </button>
        )}
      </div>
    )
  }

  // History tab: edits + original scrape data
  const dataEdits = venue.activities?.filter((a: any) => a.type === 'DATA_EDIT') || []

  return (
    <div className="pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="p-1">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-lg truncate">{venue.displayName}</h1>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {venue.siteType === 'CLUB' ? (
                <span className="flex items-center gap-1"><Building2 className="h-3 w-3" /> Club</span>
              ) : (
                <span className="flex items-center gap-1"><Hotel className="h-3 w-3" /> Hotel</span>
              )}
              <span>• {venue.approvedEgms} EGMs</span>
              {venue.lgaRegion && <span>• {venue.lgaRegion}</span>}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex mt-3 border-b -mx-4 px-4">
          <button
            onClick={() => setActiveTab('details')}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors',
              activeTab === 'details' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'
            )}
          >
            <FileText className="h-4 w-4" />
            Details
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors',
              activeTab === 'history' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'
            )}
          >
            <History className="h-4 w-4" />
            History
          </button>
        </div>
      </div>

      {activeTab === 'details' ? (
        <div className="p-4 space-y-6">
          {/* Quick Action Buttons */}
          <div className="flex gap-2">
            {primaryPhone && (
              <a
                href={`tel:${primaryPhone}`}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-full bg-green-600 text-white font-medium text-sm shadow-sm"
              >
                <Phone className="h-4 w-4" />
                Call
              </a>
            )}
            {contactEmail && (
              <a
                href={`mailto:${contactEmail}`}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-full bg-blue-600 text-white font-medium text-sm shadow-sm"
              >
                <Mail className="h-4 w-4" />
                Email
              </a>
            )}
            <button
              onClick={handleLogCall}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-full bg-orange-500 text-white font-medium text-sm shadow-sm"
            >
              <PhoneCall className="h-4 w-4" />
              Log Call
            </button>
          </div>

          {/* Pipeline Stage */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Pipeline Stage</label>
            <select
              value={venue.pipelineStage}
              onChange={(e) => handleStageChange(e.target.value)}
              className={cn(
                'w-full mt-1 px-3 py-2.5 rounded-lg border text-sm font-medium appearance-none',
                PIPELINE_STAGE_COLORS[venue.pipelineStage as keyof typeof PIPELINE_STAGE_COLORS]
              )}
            >
              {PIPELINE_STAGES.map(s => (
                <option key={s} value={s}>{PIPELINE_STAGE_LABELS[s]}</option>
              ))}
            </select>
          </div>

          {/* Navigate Button */}
          {(venue.latitude && venue.longitude) || venue.streetAddress || venue.googleAddress ? (
            <button
              onClick={() => {
                const addr = venue.googleAddress || venue.streetAddress || `${venue.latitude},${venue.longitude}`
                window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}`, '_blank')
              }}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-green-600 text-white font-medium text-sm"
            >
              <Navigation className="h-4 w-4" />
              Navigate
            </button>
          ) : null}

          {/* Open Tasks */}
          {venueTasks.length > 0 && (
            <section className="space-y-2">
              <h2 className="font-semibold flex items-center gap-2">
                <CalendarDays className="h-4 w-4" /> Open Tasks
              </h2>
              <div className="space-y-2">
                {venueTasks.map((task: Task) => {
                  const dueDate = new Date(task.dueDate)
                  const now = new Date()
                  const isOverdue = dueDate < new Date(now.getFullYear(), now.getMonth(), now.getDate())
                  return (
                    <div key={task.id} className="flex items-start gap-2 bg-secondary/50 rounded-lg p-3">
                      <button
                        onClick={() => toggleTaskComplete.mutate({ id: task.id, completed: true })}
                        className="mt-0.5 flex-shrink-0"
                      >
                        <Circle className="h-4 w-4 text-muted-foreground" />
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">
                          {TASK_TYPE_LABELS[task.type as keyof typeof TASK_TYPE_LABELS] || task.type}
                        </div>
                        {task.note && <p className="text-xs text-muted-foreground line-clamp-1">{task.note}</p>}
                        <div className={cn('text-xs mt-0.5', isOverdue ? 'text-red-600 font-medium' : 'text-muted-foreground')}>
                          Due: {dueDate.toLocaleDateString()}
                          {isOverdue && ' (overdue)'}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* Schedule Follow-up Button */}
          <button
            onClick={() => {
              setTaskDueDate(getDefaultDueDate())
              setShowTaskModal(true)
            }}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-2 border-dashed border-primary/30 text-primary font-medium text-sm hover:bg-primary/5 transition-colors"
          >
            <CalendarDays className="h-4 w-4" />
            Schedule Follow-up
          </button>

          {/* CRM Fields */}
          <section className="space-y-3">
            <h2 className="font-semibold">CRM Details</h2>

            {/* POS System */}
            <div>
              <label className="text-xs font-medium text-muted-foreground">POS System</label>
              {showAddPos ? (
                <div className="flex gap-2 mt-1">
                  <input
                    type="text"
                    value={newPosName}
                    onChange={(e) => setNewPosName(e.target.value)}
                    placeholder="New POS name..."
                    className="flex-1 px-3 py-2 rounded-lg border text-sm"
                    autoFocus
                  />
                  <button
                    onClick={() => newPosName.trim() && addPosOption.mutate(newPosName.trim())}
                    className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm"
                  >
                    Add
                  </button>
                  <button onClick={() => setShowAddPos(false)} className="px-2">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <select
                  value={venue.posSystem || ''}
                  onChange={(e) => {
                    if (e.target.value === '__other__') {
                      setShowAddPos(true)
                    } else {
                      updateVenue.mutate({ posSystem: e.target.value || null })
                    }
                  }}
                  className="w-full mt-1 px-3 py-2 rounded-lg border text-sm"
                >
                  <option value="">Select POS...</option>
                  {posOptions?.map((opt: any) => (
                    <option key={opt.id} value={opt.name}>{opt.name}</option>
                  ))}
                  <option value="__other__">+ Other...</option>
                </select>
              )}
            </div>

            {/* LMO */}
            <div>
              <label className="text-xs font-medium text-muted-foreground">LMO</label>
              <select
                value={venue.lmo || ''}
                onChange={(e) => updateVenue.mutate({ lmo: e.target.value || null })}
                className="w-full mt-1 px-3 py-2 rounded-lg border text-sm"
              >
                <option value="">Select LMO...</option>
                {LMO_OPTIONS.map(l => (
                  <option key={l} value={l}>{l === 'MAXGAMING' ? 'MaxGaming' : 'Odyssey'}</option>
                ))}
              </select>
            </div>

            {/* Phone */}
            <div>
              <label className="text-xs font-medium text-muted-foreground">Venue Phone</label>
              <input
                type="tel"
                defaultValue={venue.venuePhone || ''}
                onBlur={(e) => updateVenue.mutate({ venuePhone: e.target.value || null })}
                placeholder="(07) XXXX XXXX"
                className="w-full mt-1 px-3 py-2 rounded-lg border text-sm"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="text-xs font-medium text-muted-foreground">Notes</label>
              <textarea
                defaultValue={venue.notes || ''}
                onBlur={(e) => updateVenue.mutate({ notes: e.target.value || null })}
                placeholder="Internal notes..."
                rows={3}
                className="w-full mt-1 px-3 py-2 rounded-lg border text-sm resize-none"
              />
            </div>
          </section>

          {/* Editable Business Information */}
          <section className="space-y-2">
            <h2 className="font-semibold">Business Information</h2>
            <div className="bg-secondary/50 rounded-lg p-3 space-y-2.5 text-sm">
              <EditableField label="Display Name" field="displayName" value={venue.displayName} />
              <EditableField label="Trading Name" field="tradingName" value={venue.tradingName} />
              <EditableField label="Business Name" field="businessName" value={venue.businessName} />
              {venue.abn && (
                <div>
                  <span className="text-muted-foreground text-xs">ABN:</span>{' '}
                  <a
                    href={`https://abr.business.gov.au/ABN/View?abn=${venue.abn}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary"
                  >
                    {venue.abn} <ExternalLink className="h-3 w-3 inline" />
                  </a>
                </div>
              )}
              {venue.acn && <div><span className="text-muted-foreground text-xs">ACN:</span> {venue.acn}</div>}
              <EditableField label="Address" field="googleAddress" value={venue.googleAddress} />
              <EditableField label="Phone" field="googlePhone" value={venue.googlePhone} />
              {venue.googleRating && (
                <div className="flex items-center gap-1">
                  <Star className="h-4 w-4 text-yellow-500" />
                  {venue.googleRating}
                </div>
              )}
              <EditableField label="Website" field="googleWebsite" value={venue.googleWebsite} />
            </div>
          </section>

          {/* Contacts */}
          <section className="space-y-3">
            <h2 className="font-semibold">Contacts</h2>
            {CONTACT_ROLES.map(role => {
              const contact = getContact(role)
              return (
                <ContactCard
                  key={role}
                  role={role}
                  contact={contact}
                  onSave={(data) => updateContact.mutate(data)}
                />
              )
            })}
          </section>

          {/* Activity Feed */}
          <section className="space-y-3">
            <h2 className="font-semibold">Activity</h2>
            {venue.activities?.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activities yet</p>
            ) : (
              <div className="space-y-3">
                {venue.activities?.map((activity: any) => {
                  const config = ACTIVITY_TYPE_CONFIG[activity.type] || ACTIVITY_TYPE_CONFIG.NOTE
                  const Icon = config.icon
                  return (
                    <div key={activity.id} className="flex gap-3">
                      <div className={cn('mt-0.5', config.color)}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1">
                        <div className="text-sm">{activity.note || config.label}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          <Clock className="h-3 w-3 inline mr-1" />
                          {new Date(activity.createdAt).toLocaleDateString()} {new Date(activity.createdAt).toLocaleTimeString()}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      ) : (
        /* History Tab */
        <div className="p-4 space-y-6">
          {/* Original CSV Scrape Data */}
          <section className="space-y-2">
            <h2 className="font-semibold flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Original CSV Data
            </h2>
            <div className="bg-gray-50 rounded-lg p-3 space-y-1.5 text-sm font-mono">
              <div><span className="text-muted-foreground">Site Name:</span> {venue.siteName}</div>
              <div><span className="text-muted-foreground">Site Prefix:</span> {venue.sitePrefix || '(none)'}</div>
              <div><span className="text-muted-foreground">Site Type:</span> {venue.siteType}</div>
              <div><span className="text-muted-foreground">Approval Ref:</span> {venue.approvalRef}</div>
              <div><span className="text-muted-foreground">Approved EGMs:</span> {venue.approvedEgms}</div>
              <div><span className="text-muted-foreground">Operational EGMs:</span> {venue.operationalEgms ?? 'N/A'}</div>
              <div><span className="text-muted-foreground">SA4 Region:</span> {venue.sa4Region || 'N/A'}</div>
              <div><span className="text-muted-foreground">SA2 Region:</span> {venue.sa2Region || 'N/A'}</div>
              <div><span className="text-muted-foreground">LGA Region:</span> {venue.lgaRegion || 'N/A'}</div>
              <div><span className="text-muted-foreground">Authority Region:</span> {venue.authorityRegion || 'N/A'}</div>
              <div><span className="text-muted-foreground">CSV Last Seen:</span> {venue.csvLastSeen ? new Date(venue.csvLastSeen).toLocaleDateString() : 'N/A'}</div>
              <div><span className="text-muted-foreground">Active:</span> {venue.isActive ? 'Yes' : 'No'}</div>
            </div>
          </section>

          {/* ABR Enrichment Data */}
          {(venue.abn || venue.tradingName || venue.businessName) && (
            <section className="space-y-2">
              <h2 className="font-semibold flex items-center gap-2">
                <Globe className="h-4 w-4" />
                ABR Enrichment
              </h2>
              <div className="bg-blue-50 rounded-lg p-3 space-y-1.5 text-sm font-mono">
                <div><span className="text-muted-foreground">ABN:</span> {venue.abn || 'N/A'}</div>
                <div><span className="text-muted-foreground">ACN:</span> {venue.acn || 'N/A'}</div>
                <div><span className="text-muted-foreground">Trading Name:</span> {venue.tradingName || 'N/A'}</div>
                <div><span className="text-muted-foreground">Business Name:</span> {venue.businessName || 'N/A'}</div>
              </div>
            </section>
          )}

          {/* Google Places Enrichment Data */}
          {(venue.googlePlaceId || venue.googleAddress) && (
            <section className="space-y-2">
              <h2 className="font-semibold flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Google Places Enrichment
              </h2>
              <div className="bg-green-50 rounded-lg p-3 space-y-1.5 text-sm font-mono">
                <div><span className="text-muted-foreground">Place ID:</span> {venue.googlePlaceId || 'N/A'}</div>
                <div><span className="text-muted-foreground">Address:</span> {venue.googleAddress || 'N/A'}</div>
                <div><span className="text-muted-foreground">Phone:</span> {venue.googlePhone || 'N/A'}</div>
                <div><span className="text-muted-foreground">Rating:</span> {venue.googleRating ?? 'N/A'}</div>
                <div><span className="text-muted-foreground">Website:</span> {venue.googleWebsite || 'N/A'}</div>
              </div>
            </section>
          )}

          {/* Geocoding Data */}
          <section className="space-y-2">
            <h2 className="font-semibold flex items-center gap-2">
              <Navigation className="h-4 w-4" />
              Location Data
            </h2>
            <div className="bg-purple-50 rounded-lg p-3 space-y-1.5 text-sm font-mono">
              <div><span className="text-muted-foreground">Latitude:</span> {venue.latitude ?? 'N/A'}</div>
              <div><span className="text-muted-foreground">Longitude:</span> {venue.longitude ?? 'N/A'}</div>
              <div><span className="text-muted-foreground">Street Address:</span> {venue.streetAddress || 'N/A'}</div>
              <div><span className="text-muted-foreground">Geocode Source:</span> {venue.geocodeSource || 'N/A'}</div>
              <div><span className="text-muted-foreground">Confidence:</span> {venue.geocodeConfidence || 'N/A'}</div>
            </div>
          </section>

          {/* Edit History */}
          <section className="space-y-2">
            <h2 className="font-semibold flex items-center gap-2">
              <Pencil className="h-4 w-4" />
              Edit History
            </h2>
            {dataEdits.length === 0 ? (
              <p className="text-sm text-muted-foreground">No edits recorded</p>
            ) : (
              <div className="space-y-3">
                {dataEdits.map((edit: any) => (
                  <div key={edit.id} className="bg-cyan-50 rounded-lg p-3">
                    <div className="text-xs text-muted-foreground mb-1.5">
                      <Clock className="h-3 w-3 inline mr-1" />
                      {new Date(edit.createdAt).toLocaleDateString()} {new Date(edit.createdAt).toLocaleTimeString()}
                    </div>
                    <div className="text-sm font-mono space-y-0.5">
                      {edit.note.split('\n').map((line: string, i: number) => (
                        <div key={i}>{line}</div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Record Timestamps */}
          <section className="space-y-1 text-xs text-muted-foreground">
            <div>Created: {new Date(venue.createdAt).toLocaleString()}</div>
            <div>Updated: {new Date(venue.updatedAt).toLocaleString()}</div>
          </section>
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => setShowActivityModal(true)}
        className="fixed bottom-20 right-4 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center z-20"
      >
        <Plus className="h-6 w-6" />
      </button>

      {/* Activity Modal */}
      {showActivityModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center">
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-4 space-y-4 max-h-[70vh] overflow-y-auto pb-safe">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">Add Activity</h3>
              <button onClick={() => setShowActivityModal(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex gap-2">
              {(['NOTE', 'CALL', 'EMAIL', 'VISIT'] as const).map(type => {
                const config = ACTIVITY_TYPE_CONFIG[type]
                const Icon = config.icon
                return (
                  <button
                    key={type}
                    onClick={() => setActivityType(type)}
                    className={cn(
                      'flex-1 flex flex-col items-center gap-1 py-3 rounded-lg border text-xs font-medium transition-colors',
                      activityType === type ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary'
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    {config.label}
                  </button>
                )
              })}
            </div>

            <textarea
              value={activityNote}
              onChange={(e) => setActivityNote(e.target.value)}
              placeholder="Add a note..."
              rows={4}
              className="w-full px-3 py-2 rounded-lg border text-sm resize-none"
              autoFocus
            />

            <button
              onClick={() => addActivity.mutate({ type: activityType, note: activityNote })}
              disabled={addActivity.isPending}
              className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-medium text-sm disabled:opacity-50"
            >
              {addActivity.isPending ? 'Saving...' : 'Save Activity'}
            </button>
          </div>
        </div>
      )}

      {/* Task Schedule Modal */}
      {showTaskModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center">
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-4 space-y-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">Schedule Follow-up</h3>
              <button onClick={() => setShowTaskModal(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Task Type</label>
              <select
                value={taskType}
                onChange={(e) => setTaskType(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-lg border text-sm"
              >
                {TASK_TYPES.map(t => (
                  <option key={t} value={t}>{TASK_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Due Date</label>
              <input
                type="date"
                value={taskDueDate}
                onChange={(e) => setTaskDueDate(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-lg border text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Note (optional)</label>
              <textarea
                value={taskNote}
                onChange={(e) => setTaskNote(e.target.value)}
                placeholder="Add a note..."
                rows={3}
                className="w-full mt-1 px-3 py-2 rounded-lg border text-sm resize-none"
              />
            </div>

            <button
              onClick={() => createTask.mutate({
                venueId,
                type: taskType,
                dueDate: taskDueDate,
                note: taskNote || undefined,
              })}
              disabled={createTask.isPending || !taskDueDate}
              className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-medium text-sm disabled:opacity-50"
            >
              {createTask.isPending ? 'Saving...' : 'Schedule Task'}
            </button>
          </div>
        </div>
      )}

      {/* Re-enrich Prompt Modal */}
      {showReenrichPrompt && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-end sm:items-center justify-center">
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-4 space-y-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">Update Google Places Data?</h3>
              <button onClick={() => setShowReenrichPrompt(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-sm text-muted-foreground">
              You changed the venue name. Would you like to re-pull data from Google Places to get an updated address, phone, rating, and website?
            </p>

            <div className="flex gap-2">
              <button
                onClick={() => setShowReenrichPrompt(false)}
                className="flex-1 py-3 rounded-lg border font-medium text-sm"
              >
                No thanks
              </button>
              <button
                onClick={() => reenrichVenue.mutate()}
                disabled={reenrichVenue.isPending}
                className="flex-1 py-3 rounded-lg bg-primary text-primary-foreground font-medium text-sm disabled:opacity-50"
              >
                {reenrichVenue.isPending ? 'Fetching...' : 'Yes, update'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stage Change Note Modal */}
      {pendingStageChange && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center">
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">Stage Change Note Required</h3>
              <button onClick={() => setPendingStageChange(null)}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-sm text-muted-foreground">
              Moving to <span className="font-medium text-foreground">{PIPELINE_STAGE_LABELS[pendingStageChange as keyof typeof PIPELINE_STAGE_LABELS]}</span> requires a note explaining the transition.
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
                onClick={() => setPendingStageChange(null)}
                className="flex-1 py-3 rounded-lg border font-medium text-sm"
              >
                Cancel
              </button>
              <button
                onClick={confirmStageChange}
                disabled={!stageChangeNote.trim() || updateVenue.isPending}
                className="flex-1 py-3 rounded-lg bg-primary text-primary-foreground font-medium text-sm disabled:opacity-50"
              >
                {updateVenue.isPending ? 'Saving...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
