export interface PageArgs {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export function pageArgs(
  query: { page?: number; pageSize?: number },
  defaultPageSize = 20,
): PageArgs {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? defaultPageSize;
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function pageResult<T>(items: T[], total: number, args: PageArgs): PageResult<T> {
  return { items, total, page: args.page, pageSize: args.pageSize };
}
