interface QtyStepperProps {
  qty: number
  onChange: (qty: number) => void
  max?: number
}

export function QtyStepper({ qty, onChange, max }: QtyStepperProps) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label="Restar unidad"
        onClick={() => onChange(qty - 1)}
        className="h-7 w-7 rounded-full border border-neutral-300 text-neutral-700"
      >
        −
      </button>
      <span className="w-6 text-center text-sm">{qty}</span>
      <button
        type="button"
        aria-label="Sumar unidad"
        disabled={max !== undefined && qty >= max}
        onClick={() => onChange(qty + 1)}
        className="h-7 w-7 rounded-full border border-neutral-300 text-neutral-700 disabled:opacity-40"
      >
        +
      </button>
    </div>
  )
}
