import { ItemKind } from '@localiator/shared'
import { Badge } from '../ui/Badge'
import type { Item } from '../../types/domain'

export function LotBadge({ item }: { item: Item }) {
  if (item.kind === ItemKind.LOT) {
    return <Badge tone="amber">Lote ×{item.items.length}</Badge>
  }
  return <Badge tone="neutral">Unidad</Badge>
}
