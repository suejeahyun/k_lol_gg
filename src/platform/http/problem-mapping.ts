import type { RevisionResult } from "./concurrency";
import type { IdempotencyKeyResult } from "./idempotency";
import type { JsonBodyReadError } from "./json-body";
import type { PaginationInputResult } from "./pagination";
import { HTTP_PROBLEMS } from "./problem";

export function problemForJsonBodyError(error: JsonBodyReadError) {
  const problems = {
    BODY_READ_FAILED: HTTP_PROBLEMS.bodyReadFailed,
    BODY_TOO_LARGE: HTTP_PROBLEMS.bodyTooLarge,
    EMPTY_BODY: HTTP_PROBLEMS.emptyJsonBody,
    INVALID_CONTENT_LENGTH: HTTP_PROBLEMS.invalidContentLength,
    INVALID_JSON: HTTP_PROBLEMS.invalidJson,
    INVALID_UTF8: HTTP_PROBLEMS.invalidUtf8,
    UNSUPPORTED_MEDIA_TYPE: HTTP_PROBLEMS.unsupportedMediaType,
  } satisfies Record<JsonBodyReadError, (typeof HTTP_PROBLEMS)[keyof typeof HTTP_PROBLEMS]>;

  return problems[error];
}

export function problemForIdempotencyKeyError(
  error: Extract<IdempotencyKeyResult, { ok: false }>["error"],
) {
  return error === "MISSING"
    ? HTTP_PROBLEMS.missingIdempotencyKey
    : HTTP_PROBLEMS.invalidIdempotencyKey;
}

export function problemForIfMatchRevisionError(
  error: Extract<RevisionResult, { ok: false }>["error"],
) {
  return error === "MISSING" ? HTTP_PROBLEMS.preconditionRequired : HTTP_PROBLEMS.invalidIfMatch;
}

export function problemForRevisionError() {
  return HTTP_PROBLEMS.invalidRevision;
}

export function problemForPaginationError(
  error: Extract<PaginationInputResult, { ok: false }>["error"],
) {
  const problems = {
    DUPLICATE_CURSOR: HTTP_PROBLEMS.invalidPagination,
    DUPLICATE_LIMIT: HTTP_PROBLEMS.invalidPagination,
    INVALID_CURSOR: HTTP_PROBLEMS.invalidPagination,
    INVALID_LIMIT: HTTP_PROBLEMS.invalidPagination,
  } satisfies Record<
    Extract<PaginationInputResult, { ok: false }>["error"],
    typeof HTTP_PROBLEMS.invalidPagination
  >;

  return problems[error];
}
