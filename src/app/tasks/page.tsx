'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import {
  CheckCircle2, Circle, Clock, AlertTriangle, CalendarDays,
  PhoneCall, Send, Monitor, MoreHorizontal, ChevronDown, ChevronRight, Trash2
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { TASK_TYPE_LABELS } from '@/lib/constants'

interface Task {
  id: string
  venueId: string
  type: string
  dueDate: string
  note: string | null
  completed: boolean
  completedAt: string | null
  createdAt: string
  venue: { id: string; displayName: string }
}

const TASK_TYPE_ICONS: Record<string, typeof PhoneCall> = {
  FOLLOW_UP: CalendarDays,
  CALL_BACK: PhoneCall,
  SEND_PROPOSAL: Send,
  SCHEDULE_DEMO: Monitor,
  OTHER: MoreHorizontal,
}

function getRelativeDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diffDays = Math.round((startOfDate.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  if (diffDays === -1) return 'Yesterday'
  if (diffDays < -1) return `${Math.abs(diffDays)} days ago`
  if (diffDays <= 7) return `In ${diffDays} days`
  return new Date(dateStr).toLocaleDateString()
}

function isToday(dateStr: string): boolean {
  const date = new Date(dateStr)
  const now = new Date()
  return date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
}

function isOverdue(dateStr: string): boolean {
  const date = new Date(dateStr)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return date < startOfToday
}

function isUpcoming(dateStr: string): boolean {
  const date = new Date(dateStr)
  const now = new Date()
  const startOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  const sevenDaysOut = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 8)
  return date >= startOfTomorrow && date < sevenDaysOut
}

export default function TasksPage() {
  const queryClient = useQueryClient()
  const [showCompleted, setShowCompleted] = useState(false)

  const { data: openData, isLoading: openLoading } = useQuery({
    queryKey: ['tasks', 'open'],
    queryFn: () => fetch('/api/tasks?completed=false').then(r => r.json()),
    refetchInterval: 30000,
  })

  const { data: completedData, isLoading: completedLoading } = useQuery({
    queryKey: ['tasks', 'completed'],
    queryFn: () => fetch('/api/tasks?completed=true&limit=20').then(r => r.json()),
    enabled: showCompleted,
  })

  const toggleComplete = useMutation({
    mutationFn: async ({ id, completed }: { id: string; completed: boolean }) => {
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed }),
      })
      return res.json()
    },
    onMutate: async ({ id, completed }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks'] })
      const previousOpen = queryClient.getQueryData(['tasks', 'open'])
      queryClient.setQueryData(['tasks', 'open'], (old: any) => {
        if (!old) return old
        return {
          ...old,
          tasks: completed
            ? old.tasks.filter((t: Task) => t.id !== id)
            : old.tasks,
          overdueCount: old.overdueCount,
        }
      })
      return { previousOpen }
    },
    onError: (_err, _vars, context) => {
      if (context?.previousOpen) {
        queryClient.setQueryData(['tasks', 'open'], context.previousOpen)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['task-overdue-count'] })
    },
  })

  const deleteTask = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/tasks/${id}`, { method: 'DELETE' })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['task-overdue-count'] })
    },
  })

  const allTasks: Task[] = openData?.tasks || []
  const overdueTasks = allTasks.filter(t => !t.completed && isOverdue(t.dueDate))
  const todayTasks = allTasks.filter(t => !t.completed && isToday(t.dueDate))
  const upcomingTasks = allTasks.filter(t => !t.completed && isUpcoming(t.dueDate))
  const completedTasks: Task[] = completedData?.tasks || []

  if (openLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  const TaskCard = ({ task }: { task: Task }) => {
    const Icon = TASK_TYPE_ICONS[task.type] || CalendarDays
    const typeLabel = TASK_TYPE_LABELS[task.type as keyof typeof TASK_TYPE_LABELS] || task.type
    return (
      <div className="flex items-start gap-3 px-4 py-3 bg-white border-b last:border-b-0">
        <button
          onClick={() => toggleComplete.mutate({ id: task.id, completed: !task.completed })}
          className="mt-0.5 flex-shrink-0"
        >
          {task.completed ? (
            <CheckCircle2 className="h-5 w-5 text-green-500" />
          ) : (
            <Circle className="h-5 w-5 text-muted-foreground" />
          )}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-secondary text-secondary-foreground">
              <Icon className="h-3 w-3" />
              {typeLabel}
            </span>
          </div>
          <Link
            href={`/venues/${task.venue.id}`}
            className="text-sm font-medium text-primary hover:underline block mt-0.5 truncate"
          >
            {task.venue.displayName}
          </Link>
          {task.note && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{task.note}</p>
          )}
          <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {getRelativeDate(task.dueDate)}
          </div>
        </div>
        <button
          onClick={() => deleteTask.mutate(task.id)}
          className="flex-shrink-0 p-1 text-muted-foreground hover:text-red-500"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    )
  }

  return (
    <div className="pb-20 max-w-2xl mx-auto">
      <div className="sticky top-0 z-10 bg-white border-b px-4 py-3">
        <h1 className="text-xl font-bold">Tasks</h1>
        <p className="text-sm text-muted-foreground">
          {allTasks.length} open task{allTasks.length !== 1 ? 's' : ''}
        </p>
      </div>

      <div className="space-y-0">
        {/* Overdue Section */}
        {overdueTasks.length > 0 && (
          <div>
            <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border-b">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <h2 className="text-sm font-semibold text-red-700">Overdue ({overdueTasks.length})</h2>
            </div>
            {overdueTasks.map(task => <TaskCard key={task.id} task={task} />)}
          </div>
        )}

        {/* Today Section */}
        {todayTasks.length > 0 && (
          <div>
            <div className="flex items-center gap-2 px-4 py-2 bg-orange-50 border-b">
              <Clock className="h-4 w-4 text-orange-600" />
              <h2 className="text-sm font-semibold text-orange-700">Today ({todayTasks.length})</h2>
            </div>
            {todayTasks.map(task => <TaskCard key={task.id} task={task} />)}
          </div>
        )}

        {/* Upcoming Section */}
        {upcomingTasks.length > 0 && (
          <div>
            <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 border-b">
              <CalendarDays className="h-4 w-4 text-blue-600" />
              <h2 className="text-sm font-semibold text-blue-700">Upcoming ({upcomingTasks.length})</h2>
            </div>
            {upcomingTasks.map(task => <TaskCard key={task.id} task={task} />)}
          </div>
        )}

        {/* Empty state */}
        {allTasks.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <CalendarDays className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No open tasks</p>
            <p className="text-sm mt-1">Schedule follow-ups from venue detail pages</p>
          </div>
        )}

        {/* Completed Section */}
        <div>
          <button
            onClick={() => setShowCompleted(!showCompleted)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-y w-full text-left"
          >
            {showCompleted ? (
              <ChevronDown className="h-4 w-4 text-gray-500" />
            ) : (
              <ChevronRight className="h-4 w-4 text-gray-500" />
            )}
            <h2 className="text-sm font-semibold text-gray-500">Completed</h2>
          </button>
          {showCompleted && (
            completedLoading ? (
              <div className="flex items-center justify-center py-6">
                <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
              </div>
            ) : completedTasks.length === 0 ? (
              <div className="text-center py-6 text-sm text-muted-foreground">No completed tasks</div>
            ) : (
              completedTasks.map(task => <TaskCard key={task.id} task={task} />)
            )
          )}
        </div>
      </div>
    </div>
  )
}
