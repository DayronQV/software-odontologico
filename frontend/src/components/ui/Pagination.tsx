import { Button } from './Button';
import { Icon } from './Icon';

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, pageSize, total, onPageChange }: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <nav aria-label="Paginación" className="flex flex-wrap items-center justify-between gap-3 px-1 pt-4">
      <p className="text-sm text-slate-500">
        {total === 0 ? 'Sin resultados' : `${from}–${to} de ${total}`}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <Icon name="chevronLeft" className="h-4 w-4" /> Anterior
        </Button>
        <span className="text-sm text-slate-500">
          {page} / {pages}
        </span>
        <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onPageChange(page + 1)}>
          Siguiente <Icon name="chevronRight" className="h-4 w-4" />
        </Button>
      </div>
    </nav>
  );
}
