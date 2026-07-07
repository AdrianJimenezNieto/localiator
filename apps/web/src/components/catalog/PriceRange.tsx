import { formatPrice } from '../../lib/format'

interface PriceRangeProps {
  maxPrice: number
  value: number | undefined
  onChange: (value: number | undefined) => void
}

export function PriceRange({ maxPrice, value, onChange }: PriceRangeProps) {
  const current = value ?? maxPrice

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="price-range" className="text-sm font-medium text-neutral-700">
        Precio máximo: {formatPrice(current)}
      </label>
      <input
        id="price-range"
        type="range"
        min={0}
        max={maxPrice}
        step={100}
        value={current}
        onChange={(event) => {
          const next = Number(event.target.value)
          onChange(next === maxPrice ? undefined : next)
        }}
      />
    </div>
  )
}
