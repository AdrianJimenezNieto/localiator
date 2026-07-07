import type { ReactNode } from 'react'

interface EmptyStateProps {
  title: string
  description?: string
  action?: ReactNode
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-2 py-16 text-center text-neutral-500">
      <p className="text-lg font-medium text-neutral-700">{title}</p>
      {description && <p className="max-w-xs text-sm">{description}</p>}
      {action}
    </div>
  )
}
