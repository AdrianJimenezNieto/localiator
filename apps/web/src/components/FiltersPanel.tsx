import { useEffect, useState } from 'react';
import type { ItemCondition } from '@localiator/shared';
import { useApi } from '../lib/useApi';
import { useDebounce } from '../lib/useDebounce';
import { CONDITION_OPTIONS } from '../lib/format';

// Categoría tal como la devuelve GET /categories (solo lo que usa el selector).
interface Category {
  id: string;
  name: string;
}

// Filtros activos, tal como viven en la URL. Precio en euros (lo que teclea el
// usuario); la conversión a céntimos la hace la página al llamar a la API.
export interface CatalogFilters {
  q: string;
  categoryId: string;
  minPrice: string;
  maxPrice: string;
  conditions: ItemCondition[];
}

interface FiltersPanelProps {
  filters: CatalogFilters;
  resultCount: number | null;
  onChange: (patch: Partial<CatalogFilters>) => void;
  onClear: () => void;
}

export function FiltersPanel({
  filters,
  resultCount,
  onChange,
  onClear,
}: FiltersPanelProps) {
  const { data: categories } = useApi<Category[]>('/categories');

  // La búsqueda por texto se maneja con estado local + debounce para no reescribir
  // la URL (ni llamar a la API) en cada tecla. El resto de filtros se aplican al
  // instante porque son un clic puntual.
  const [qInput, setQInput] = useState(filters.q);
  const debouncedQ = useDebounce(qInput, 350);

  useEffect(() => {
    if (debouncedQ !== filters.q) {
      onChange({ q: debouncedQ });
    }
    // Solo reaccionamos al valor con debounce; filters.q/onChange no deben re-disparar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ]);

  // Si se limpian los filtros desde fuera, el input local debe reflejarlo.
  useEffect(() => {
    setQInput(filters.q);
  }, [filters.q]);

  function toggleCondition(value: ItemCondition) {
    const next = filters.conditions.includes(value)
      ? filters.conditions.filter((c) => c !== value)
      : [...filters.conditions, value];
    onChange({ conditions: next });
  }

  const priceInvalid =
    filters.minPrice !== '' &&
    filters.maxPrice !== '' &&
    Number(filters.minPrice) > Number(filters.maxPrice);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <label htmlFor="q" className="mb-1 block text-sm font-medium">
          Buscar
        </label>
        <input
          id="q"
          type="search"
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          placeholder="Nombre o descripción…"
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
        />
      </div>

      <div>
        <label htmlFor="category" className="mb-1 block text-sm font-medium">
          Categoría
        </label>
        <select
          id="category"
          value={filters.categoryId}
          onChange={(e) => onChange({ categoryId: e.target.value })}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
        >
          <option value="">Todas</option>
          {categories?.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <span className="mb-1 block text-sm font-medium">Precio (€)</span>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0"
            inputMode="decimal"
            value={filters.minPrice}
            onChange={(e) => onChange({ minPrice: e.target.value })}
            placeholder="Mín"
            aria-label="Precio mínimo"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
          />
          <span className="text-neutral-400">–</span>
          <input
            type="number"
            min="0"
            inputMode="decimal"
            value={filters.maxPrice}
            onChange={(e) => onChange({ maxPrice: e.target.value })}
            placeholder="Máx"
            aria-label="Precio máximo"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
          />
        </div>
        {priceInvalid && (
          <p className="mt-1 text-xs text-red-600">
            El precio mínimo no puede superar al máximo.
          </p>
        )}
      </div>

      <fieldset>
        <legend className="mb-1 block text-sm font-medium">Estado</legend>
        <div className="flex flex-col gap-1">
          {CONDITION_OPTIONS.map((opt) => (
            <label key={opt.value} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={filters.conditions.includes(opt.value)}
                onChange={() => toggleCondition(opt.value)}
                className="h-4 w-4 rounded border-neutral-300"
              />
              {opt.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex items-center justify-between border-t border-neutral-200 pt-3">
        <span className="text-sm text-neutral-500">
          {resultCount !== null && `${resultCount} resultado${resultCount === 1 ? '' : 's'}`}
        </span>
        <button
          type="button"
          onClick={onClear}
          className="text-sm text-neutral-600 underline hover:text-neutral-900"
        >
          Limpiar filtros
        </button>
      </div>
    </div>
  );
}
