import { useState } from 'react';

// Galería mínima sin dependencias: una foto principal grande + miniaturas para
// cambiarla. Si no hay fotos, un placeholder. `name` alimenta el alt (accesibilidad
// y SEO). Un carrusel con librería solo se añadiría si hiciera falta.
export function Gallery({ photos, name }: { photos: string[]; name: string }) {
  const [active, setActive] = useState(0);

  if (photos.length === 0) {
    return (
      <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-neutral-100 text-neutral-400">
        Sin fotos
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="aspect-square w-full overflow-hidden rounded-lg bg-neutral-100">
        <img
          src={photos[active]}
          alt={name}
          className="h-full w-full object-cover"
        />
      </div>

      {photos.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {photos.map((photo, i) => (
            <button
              key={photo}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`Ver foto ${i + 1} de ${name}`}
              aria-current={i === active}
              className={`h-16 w-16 overflow-hidden rounded-md border-2 ${
                i === active ? 'border-neutral-900' : 'border-transparent'
              }`}
            >
              <img
                src={photo}
                alt=""
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
