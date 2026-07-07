import { ConditionTag } from './ConditionTag'
import type { LotItem } from '../../types/domain'

export function LotContents({ items }: { items: LotItem[] }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="font-semibold text-neutral-900">Contenido del lote ({items.length} artículos)</h2>
      <ul className="flex flex-col divide-y divide-neutral-200 rounded-lg border border-neutral-200">
        {items.map((item, index) => (
          <li key={`${item.name}-${index}`} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
            <span>
              {item.name} {item.qty > 1 && <span className="text-neutral-400">×{item.qty}</span>}
            </span>
            <ConditionTag condition={item.condition} />
          </li>
        ))}
      </ul>
    </div>
  )
}
