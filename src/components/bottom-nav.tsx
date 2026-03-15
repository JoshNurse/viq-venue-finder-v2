'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Building2, KanbanSquare, Map, LayoutDashboard, Settings, ClipboardCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

const tabs = [
  { href: '/venues', label: 'Venues', icon: Building2 },
  { href: '/pipeline', label: 'Pipeline', icon: KanbanSquare },
  { href: '/map', label: 'Map', icon: Map },
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/tasks', label: 'Tasks', icon: ClipboardCheck, showBadge: true },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function BottomNav() {
  const pathname = usePathname()

  const { data: taskData } = useQuery({
    queryKey: ['task-overdue-count'],
    queryFn: () => fetch('/api/tasks?overdue=true&limit=1').then(r => r.json()),
    refetchInterval: 60000,
  })

  const overdueCount = taskData?.overdueCount || 0

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-border pb-[env(safe-area-inset-bottom)]">
      <div className="flex justify-around items-center h-16 max-w-lg mx-auto">
        {tabs.map((tab) => {
          const isActive = pathname?.startsWith(tab.href)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'flex flex-col items-center justify-center gap-1 px-3 py-2 text-xs transition-colors relative',
                isActive
                  ? 'text-primary font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <div className="relative">
                <tab.icon className={cn('h-5 w-5', isActive && 'text-primary')} />
                {tab.showBadge && overdueCount > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold">
                    {overdueCount > 99 ? '99+' : overdueCount}
                  </span>
                )}
              </div>
              <span>{tab.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
