interface ChipProps {
  label: string
  active?: boolean
  onClick?: () => void
}

export function Chip({ label, active = false, onClick }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`whitespace-nowrap rounded-full border px-3 py-1 text-sm transition-colors ${
        active
          ? 'border-amber-500 bg-amber-500 text-neutral-900'
          : 'border-neutral-300 bg-white text-neutral-700 hover:border-amber-400'
      }`}
    >
      {label}
    </button>
  )
}
