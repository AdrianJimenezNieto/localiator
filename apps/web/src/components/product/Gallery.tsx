import { useState } from 'react'

export function Gallery({ images, alt }: { images: string[]; alt: string }) {
  const [active, setActive] = useState(0)
  const hasImages = images.length > 0

  return (
    <div className="flex flex-col gap-2">
      <div className="flex aspect-square items-center justify-center rounded-lg bg-neutral-100 text-neutral-400">
        {hasImages ? (
          <img src={images[active]} alt={alt} className="h-full w-full rounded-lg object-cover" />
        ) : (
          <span className="text-sm">Sin imagen</span>
        )}
      </div>
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto">
          {images.map((src, index) => (
            <button
              key={src}
              type="button"
              onClick={() => setActive(index)}
              className={`h-14 w-14 shrink-0 rounded-md border-2 ${
                index === active ? 'border-amber-500' : 'border-transparent'
              }`}
            >
              <img src={src} alt="" className="h-full w-full rounded object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
