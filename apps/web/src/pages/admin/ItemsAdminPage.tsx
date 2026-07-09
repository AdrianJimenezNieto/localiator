import { Link } from 'react-router-dom';
import type { ItemKind } from '@localiator/shared';
import { apiSend, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useAuthedData } from '../../lib/useAuthedData';
import {
  itemBasePath,
  itemLabels,
  type AdminItem,
} from '../../lib/adminTypes';
import { conditionLabel, formatPrice } from '../../lib/format';

// Listado de gestión de productos o lotes (mismo código, `kind` decide endpoint y
// rutas). Muestra TODOS los artículos, también los agotados.
export function ItemsAdminPage({ kind }: { kind: ItemKind }) {
  const { token } = useAuth();
  const labels = itemLabels(kind);
  const base = kind === 'lot' ? 'lotes' : 'productos';
  const { data, error, loading, reload } = useAuthedData<AdminItem[]>(
    itemBasePath(kind),
    token,
  );

  async function handleDelete(item: AdminItem) {
    if (!window.confirm(`¿Borrar "${item.name}"?`)) return;
    try {
      await apiSend(
        'DELETE',
        `${itemBasePath(kind)}/${item.id}`,
        undefined,
        token ?? undefined,
      );
      reload();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'No se pudo borrar');
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{labels.plural}</h1>
        <Link
          to={`/admin/${base}/nuevo`}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
        >
          Nuevo
        </Link>
      </div>

      {loading && <p className="text-neutral-500">Cargando…</p>}
      {error && <p className="text-red-700">{error}</p>}

      {data && data.length === 0 && (
        <p className="text-neutral-500">No hay {labels.plural.toLowerCase()} todavía.</p>
      )}

      {data && data.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-200 text-neutral-500">
              <tr>
                <th className="p-3 font-medium">Nombre</th>
                <th className="p-3 font-medium">Categoría</th>
                <th className="p-3 font-medium">Estado</th>
                <th className="p-3 font-medium">Precio</th>
                <th className="p-3 font-medium">Stock</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {data.map((item) => (
                <tr key={item.id}>
                  <td className="p-3 font-medium">{item.name}</td>
                  <td className="p-3 text-neutral-600">{item.category?.name ?? '—'}</td>
                  <td className="p-3 text-neutral-600">
                    {conditionLabel(item.condition)}
                  </td>
                  <td className="p-3">{formatPrice(item.priceCents)}</td>
                  <td className="p-3">{item.stock}</td>
                  <td className="p-3">
                    <div className="flex justify-end gap-2">
                      <Link
                        to={`/admin/${base}/${item.id}`}
                        className="rounded-md border border-neutral-300 px-3 py-1.5 hover:bg-neutral-100"
                      >
                        Editar
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDelete(item)}
                        className="rounded-md border border-neutral-300 px-3 py-1.5 text-red-700 hover:bg-red-50"
                      >
                        Borrar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
