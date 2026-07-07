import { Badge } from '../ui/Badge'
import type { Condition } from '../../types/domain'

const labels: Record<Condition, string> = {
  nuevo: 'Nuevo',
  usado: 'Usado',
  devolucion: 'Devolución',
}

export function ConditionTag({ condition }: { condition: Condition }) {
  return <Badge tone={condition === 'nuevo' ? 'success' : 'neutral'}>{labels[condition]}</Badge>
}
