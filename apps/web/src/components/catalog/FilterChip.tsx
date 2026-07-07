import { Chip } from '../ui/Chip'

export function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return <Chip label={label} active={active} onClick={onClick} />
}
