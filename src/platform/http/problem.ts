import { noStoreSecurityHeaders } from "./response-headers";
import { validateTraceId } from "./trace";

const PUBLIC_PROBLEM = Symbol("public-problem");
const PUBLIC_CODE_PATTERN = /^[A-Z][A-Z0-9_]{2,63}$/;
const UNSAFE_PUBLIC_TEXT_PATTERN = /[\u0000-\u001f\u007f-\u009f]/;

export type PublicProblemDefinition = Readonly<{
  code: string;
  detail: string;
  status: number;
  title: string;
  type: `urn:klol:problem:${string}`;
  [PUBLIC_PROBLEM]: true;
}>;

export type ProblemDocument = {
  code: string;
  detail: string;
  status: number;
  title: string;
  traceId?: string;
  type: string;
};

function assertPublicText(value: string, name: string, maximumLength: number) {
  if (
    value.length === 0 ||
    value.length > maximumLength ||
    value.trim() !== value ||
    UNSAFE_PUBLIC_TEXT_PATTERN.test(value)
  ) {
    throw new TypeError(`${name} is not safe public text`);
  }
}

export function definePublicProblem(input: {
  code: string;
  detail: string;
  status: number;
  title: string;
}): PublicProblemDefinition {
  if (!PUBLIC_CODE_PATTERN.test(input.code)) {
    throw new TypeError("problem code must use public upper-snake-case format");
  }
  if (!Number.isInteger(input.status) || input.status < 400 || input.status > 599) {
    throw new RangeError("problem status must be an HTTP error status");
  }
  assertPublicText(input.title, "problem title", 120);
  assertPublicText(input.detail, "problem detail", 500);

  const slug = input.code.toLowerCase().replaceAll("_", "-");
  return Object.freeze({
    ...input,
    type: `urn:klol:problem:${slug}` as const,
    [PUBLIC_PROBLEM]: true as const,
  });
}

export const HTTP_PROBLEMS = Object.freeze({
  bodyReadFailed: definePublicProblem({
    code: "BODY_READ_FAILED",
    status: 400,
    title: "요청 본문을 읽을 수 없습니다.",
    detail: "요청 본문 전송 상태를 확인한 뒤 다시 시도해 주세요.",
  }),
  bodyTooLarge: definePublicProblem({
    code: "BODY_TOO_LARGE",
    status: 413,
    title: "요청 본문이 너무 큽니다.",
    detail: "허용된 요청 크기 안에서 다시 전송해 주세요.",
  }),
  emptyJsonBody: definePublicProblem({
    code: "EMPTY_JSON_BODY",
    status: 400,
    title: "JSON 요청 본문이 비어 있습니다.",
    detail: "필요한 JSON 값을 요청 본문에 포함해 주세요.",
  }),
  internalError: definePublicProblem({
    code: "INTERNAL_ERROR",
    status: 500,
    title: "요청을 처리하지 못했습니다.",
    detail: "잠시 후 다시 시도해 주세요.",
  }),
  invalidContentLength: definePublicProblem({
    code: "INVALID_CONTENT_LENGTH",
    status: 400,
    title: "요청 본문 길이가 올바르지 않습니다.",
    detail: "올바른 본문 길이로 다시 전송해 주세요.",
  }),
  invalidIdempotencyKey: definePublicProblem({
    code: "INVALID_IDEMPOTENCY_KEY",
    status: 400,
    title: "멱등성 키가 올바르지 않습니다.",
    detail: "허용된 형식의 Idempotency-Key를 사용해 주세요.",
  }),
  invalidIfMatch: definePublicProblem({
    code: "INVALID_IF_MATCH",
    status: 400,
    title: "If-Match 값이 올바르지 않습니다.",
    detail: "현재 리소스의 정수 revision ETag를 사용해 주세요.",
  }),
  invalidJson: definePublicProblem({
    code: "INVALID_JSON",
    status: 400,
    title: "JSON 형식이 올바르지 않습니다.",
    detail: "JSON 문법을 확인한 뒤 다시 전송해 주세요.",
  }),
  invalidPagination: definePublicProblem({
    code: "INVALID_PAGINATION",
    status: 400,
    title: "페이지 조회 조건이 올바르지 않습니다.",
    detail: "cursor와 limit 값을 확인해 주세요.",
  }),
  invalidRevision: definePublicProblem({
    code: "INVALID_REVISION",
    status: 400,
    title: "revision 값이 올바르지 않습니다.",
    detail: "0 이상의 안전한 정수를 사용해 주세요.",
  }),
  invalidUtf8: definePublicProblem({
    code: "INVALID_UTF8",
    status: 400,
    title: "요청 본문 인코딩이 올바르지 않습니다.",
    detail: "유효한 UTF-8 JSON으로 다시 전송해 주세요.",
  }),
  missingIdempotencyKey: definePublicProblem({
    code: "IDEMPOTENCY_KEY_REQUIRED",
    status: 400,
    title: "멱등성 키가 필요합니다.",
    detail: "Idempotency-Key 헤더를 포함해 주세요.",
  }),
  preconditionRequired: definePublicProblem({
    code: "PRECONDITION_REQUIRED",
    status: 428,
    title: "현재 revision 확인이 필요합니다.",
    detail: "If-Match 헤더에 현재 revision ETag를 포함해 주세요.",
  }),
  unsupportedMediaType: definePublicProblem({
    code: "UNSUPPORTED_MEDIA_TYPE",
    status: 415,
    title: "지원하지 않는 요청 형식입니다.",
    detail: "application/json 형식으로 요청해 주세요.",
  }),
});

function isPublicProblem(value: unknown): value is PublicProblemDefinition {
  try {
    return Boolean(
      value &&
        typeof value === "object" &&
        PUBLIC_PROBLEM in value &&
        (value as PublicProblemDefinition)[PUBLIC_PROBLEM] === true,
    );
  } catch {
    return false;
  }
}

export function problemResponse(
  problem: PublicProblemDefinition,
  options: { headers?: HeadersInit; traceId?: string } = {},
) {
  const safeProblem = isPublicProblem(problem) ? problem : HTTP_PROBLEMS.internalError;
  const traceId = validateTraceId(options.traceId);
  const body: ProblemDocument = {
    type: safeProblem.type,
    title: safeProblem.title,
    status: safeProblem.status,
    detail: safeProblem.detail,
    code: safeProblem.code,
    ...(traceId ? { traceId } : {}),
  };

  return new Response(JSON.stringify(body), {
    status: safeProblem.status,
    headers: noStoreSecurityHeaders({
      contentType: "application/problem+json; charset=utf-8",
      headers: options.headers,
      traceId,
    }),
  });
}
