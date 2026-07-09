import { useState, type ChangeEvent } from 'react';
import { apiUpload, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';

// Gestiona el array de URLs de fotos de un producto/lote: subir (al endpoint de
// 05), previsualizar, reordenar y quitar. El array resultante lo guarda el
// formulario padre en `photos` al enviar el PATCH/POST.
interface PhotoManagerProps {
  photos: string[];
  onChange: (photos: string[]) => void;
}

export function PhotoManager({ photos, onChange }: PhotoManagerProps) {
  const { token } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite volver a elegir el mismo archivo.
    if (!file) return;

    setError(null);
    setUploading(true);
    try {
      const { url } = await apiUpload('/uploads', file, token ?? undefined);
      onChange([...photos, url]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo subir la foto');
    } finally {
      setUploading(false);
    }
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= photos.length) return;
    const next = [...photos];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  function remove(index: number) {
    onChange(photos.filter((_, i) => i !== index));
  }

  return (
    <div>
      <span className="mb-1 block text-sm font-medium">Fotos</span>

      {photos.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-3">
          {photos.map((url, i) => (
            <li
              key={url}
              className="relative w-24 overflow-hidden rounded-md border border-neutral-200"
            >
              <img src={url} alt="" className="h-24 w-24 object-cover" />
              <div className="flex items-center justify-between bg-neutral-100 px-1 py-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label="Mover antes"
                  className="px-1 disabled:opacity-30"
                >
                  ◀
                </button>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  aria-label="Quitar foto"
                  className="px-1 text-red-700"
                >
                  ✕
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === photos.length - 1}
                  aria-label="Mover después"
                  className="px-1 disabled:opacity-30"
                >
                  ▶
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <label className="inline-block cursor-pointer rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium hover:bg-neutral-100">
        {uploading ? 'Subiendo…' : 'Añadir foto'}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFile}
          disabled={uploading}
          className="hidden"
        />
      </label>
      <p className="mt-1 text-xs text-neutral-500">
        La primera foto es la portada. JPEG, PNG o WebP.
      </p>

      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
