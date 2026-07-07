import { sortLabels, type SortOption } from '../../types/filters'

interface SortMenuProps {
  value: SortOption
  onChange: (value: SortOption) => void
}

export function SortMenu({ value, onChange }: SortMenuProps) {
  return (
    <select
      aria-label="Ordenar"
      value={value}
      onChange={(event) => onChange(event.target.value as SortOption)}
      className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
    >
      {Object.entries(sortLabels).map(([option, label]) => (
        <option key={option} value={option}>
          {label}
        </option>
      ))}
    </select>
  )
}
