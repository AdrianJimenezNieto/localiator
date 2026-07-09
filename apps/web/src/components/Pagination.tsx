// Controles de paginación apoyados en los metadatos del backend (total, page,
// pageSize). `onPageChange` deja que la página que lo usa refleje el cambio en la
// URL (así recargar/compartir mantiene la página).

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, pageSize, total, onPageChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  return (
    <nav
      className="mt-8 flex items-center justify-center gap-4"
      aria-label="Paginación"
    >
      <button
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className="min-h-11 rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 enabled:hover:bg-neutral-100"
      >
        Anterior
      </button>

      <span className="text-sm text-neutral-600">
        Página {page} de {totalPages}
      </span>

      <button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className="min-h-11 rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 enabled:hover:bg-neutral-100"
      >
        Siguiente
      </button>
    </nav>
  );
}
