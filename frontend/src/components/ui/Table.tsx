import type { ReactNode } from 'react';

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  /** Oculta la columna en pantallas pequeñas. */
  hideOnSmall?: boolean;
  align?: 'left' | 'right';
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  getKey: (row: T) => string;
  caption: string;
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
}

/** Tabla con desplazamiento horizontal en pantallas estrechas y filas clicables opcionales. */
export function DataTable<T>({ columns, rows, getKey, caption, empty = 'Sin registros', onRowClick }: DataTableProps<T>) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line text-xs font-medium uppercase tracking-wide text-slate-500">
            {columns.map((c) => (
              <th
                key={c.header}
                scope="col"
                className={`px-4 py-3 ${c.align === 'right' ? 'text-right' : ''} ${c.hideOnSmall ? 'hidden md:table-cell' : ''}`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-slate-500">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={getKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={onRowClick ? 'cursor-pointer transition hover:bg-brand-50/50' : ''}
              >
                {columns.map((c) => (
                  <td
                    key={c.header}
                    className={`px-4 py-3.5 align-middle ${c.align === 'right' ? 'text-right' : ''} ${c.hideOnSmall ? 'hidden md:table-cell' : ''}`}
                  >
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
