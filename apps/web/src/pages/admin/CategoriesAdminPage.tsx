import { useState, type FormEvent } from 'react';
import { apiSend, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useAuthedData } from '../../lib/useAuthedData';
import type { Category } from '../../lib/adminTypes';

export function CategoriesAdminPage() {
  const { token } = useAuth();
  const { data, error, loading, reload } = useAuthedData<Category[]>(
    '/categories',
    token,
  );
  const [name, setName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setBusy(true);
    try {
      await apiSend('POST', '/categories', { name }, token ?? undefined);
      setName('');
      reload();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'No se pudo crear');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(cat: Category) {
    if (!window.confirm(`¿Borrar la categoría "${cat.name}"?`)) return;
    try {
      await apiSend('DELETE', `/categories/${cat.id}`, undefined, token ?? undefined);
      reload();
    } catch (err) {
      // Típico: 409 si la categoría tiene productos/lotes asociados.
      alert(err instanceof ApiError ? err.message : 'No se pudo borrar');
    }
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Categorías</h1>

      <form onSubmit={handleCreate} className="mb-6 flex flex-wrap items-end gap-3">
        <div className="flex-1">
          <label htmlFor="name" className="mb-1 block text-sm font-medium">
            Nueva categoría
          </label>
          <input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Nombre"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 focus:border-neutral-900 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="min-h-11 rounded-md bg-neutral-900 px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          Añadir
        </button>
      </form>
      {formError && (
        <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">
          {formError}
        </p>
      )}

      {loading && <p className="text-neutral-500">Cargando…</p>}
      {error && <p className="text-red-700">{error}</p>}

      {data && (
        <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
          {data.length === 0 && (
            <li className="p-4 text-neutral-500">No hay categorías todavía.</li>
          )}
          {data.map((cat) => (
            <li key={cat.id} className="flex items-center justify-between gap-4 p-3">
              <div>
                <span className="font-medium">{cat.name}</span>
                <span className="ml-2 text-sm text-neutral-400">/{cat.slug}</span>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(cat)}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
              >
                Borrar
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
