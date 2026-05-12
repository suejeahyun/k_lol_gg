export type PaginationInput = {
  page?: string | number | null;
  pageSize?: string | number | null;
  defaultPageSize?: number;
  maxPageSize?: number;
};

export type PaginationResult = {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
};

function toPositiveInteger(value: string | number | null | undefined) {
  const parsed = typeof value === "number" ? value : Number(value ?? "");
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function getSafePagination(input: PaginationInput = {}): PaginationResult {
  const defaultPageSize = input.defaultPageSize ?? 10;
  const maxPageSize = input.maxPageSize ?? 100;

  const page = toPositiveInteger(input.page) ?? 1;
  const requestedPageSize = toPositiveInteger(input.pageSize) ?? defaultPageSize;
  const pageSize = Math.min(Math.max(requestedPageSize, 1), maxPageSize);

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}

export function getPaginationMeta(totalCount: number, pagination: PaginationResult) {
  return {
    page: pagination.page,
    pageSize: pagination.pageSize,
    totalCount,
    totalPages: Math.ceil(totalCount / pagination.pageSize),
  };
}
