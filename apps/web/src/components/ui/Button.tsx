import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost'

const variantClasses: Record<Variant, string> = {
  primary: 'bg-amber-500 text-neutral-900 hover:bg-amber-400',
  secondary: 'bg-neutral-200 text-neutral-900 hover:bg-neutral-300',
  ghost: 'bg-transparent text-neutral-700 hover:bg-neutral-100',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
}

export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  return (
    <button
      className={`rounded-lg px-4 py-2 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variantClasses[variant]} ${className}`}
      {...props}
    />
  )
}
