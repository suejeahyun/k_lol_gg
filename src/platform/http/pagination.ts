export const DEFAULT_PAGE_LIMIT = 20;
export const MAXIMUM_PAGE_LIMIT = 100;
export const MAXIMUM_CURSOR_LENGTH = 512;

const CURSOR_PATTERN = /^[A-Za-z0-9_-]+$/;
const LIMIT_PATTERN = /^[1-9][0-9]{0,2}$/;

export type PaginationInput = Readonly<{
  cursor?: string;
  limit: number;
}>;

export type PaginationInputResult =
  | { ok: true; value: PaginationInput }
  | {
      ok: false;
      error:
        | "DUPLICATE_CURSOR"
        | "DUPLICATE_LIMIT"
        | "INVALID_CURSOR"
        | "INVALID_LIMIT";
    };

export function parsePaginationInput(
  searchParams: URLSearchParams,
  options: { defaultLimit?: number; maximumLimit?: number } = {},
): PaginationInputResult {
  const maximumLimit = options.maximumLimit ?? MAXIMUM_PAGE_LIMIT;
  const defaultLimit = options.defaultLimit ?? DEFAULT_PAGE_LIMIT;
  if (
    !Number.isSafeInteger(maximumLimit) ||
    maximumLimit < 1 ||
    maximumLimit > MAXIMUM_PAGE_LIMIT ||
    !Number.isSafeInteger(defaultLimit) ||
    defaultLimit < 1 ||
    defaultLimit > maximumLimit
  ) {
    throw new RangeError("pagination limits are outside the supported range");
  }

  const cursors = searchParams.getAll("cursor");
  if (cursors.length > 1) return { ok: false, error: "DUPLICATE_CURSOR" };
  const limits = searchParams.getAll("limit");
  if (limits.length > 1) return { ok: false, error: "DUPLICATE_LIMIT" };

  const cursor = cursors[0];
  if (
    cursor !== undefined &&
    (cursor.length < 1 ||
      cursor.length > MAXIMUM_CURSOR_LENGTH ||
      !CURSOR_PATTERN.test(cursor) ||
      cursor.length % 4 === 1)
  ) {
    return { ok: false, error: "INVALID_CURSOR" };
  }

  let limit = defaultLimit;
  if (limits[0] !== undefined) {
    if (!LIMIT_PATTERN.test(limits[0])) return { ok: false, error: "INVALID_LIMIT" };
    limit = Number(limits[0]);
    if (limit > maximumLimit) return { ok: false, error: "INVALID_LIMIT" };
  }

  return {
    ok: true,
    value: Object.freeze({ ...(cursor ? { cursor } : {}), limit }),
  };
}
