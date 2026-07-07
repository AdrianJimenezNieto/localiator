import type { ReactNode } from 'react'

type Tone = 'neutral' | 'amber' | 'success'

const toneClasses: Record<Tone, string> = {
  neutral: 'bg-neutral-200 text-neutral-800',
  amber: 'bg-amber-100 text-amber-900',
  success: 'bg-green-100 text-green-800',
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${toneClasses[tone]}`}>
      {children}
    </span>
  )
}
