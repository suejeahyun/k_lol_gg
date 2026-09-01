import assert from "node:assert/strict";
import test from "node:test";
import {
  HTTP_PROBLEMS,
  MAXIMUM_CURSOR_LENGTH,
  MAXIMUM_JSON_BODY_LIMIT_BYTES,
  definePublicProblem,
  formatRevisionEtag,
  idempotencyHashMaterial,
  isSupportedJsonContentType,
  noStoreJsonResponse,
  noStoreSecurityHeaders,
  parsePaginationInput,
  parseRevision,
  problemForIdempotencyKeyError,
  problemForIfMatchRevisionError,
  problemForJsonBodyError,
  problemForPaginationError,
  problemResponse,
  readIdempotencyKey,
  readIfMatchRevision,
  readJsonBody,
  readValidatedTraceId,
  traceIdFromTraceparent,
  validateTraceId,
} from "../src/platform/http/index";

const TRACE_ID = "4bf92f3577b34da6a3ce929d0e0e4736";
const PARENT_ID = "00f067aa0ba902b7";

function jsonRequest(body: BodyInit | null, headers: HeadersInit = {}) {
  return new Request("https://v2.example.test/api/resource", {
    method: "POST",
    body,
    headers: { "content-type": "application/json", ...headers },
  });
}

function streamRequest(chunks: Uint8Array[], headers: HeadersInit = {}) {
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks.shift();
      if (chunk) controller.enqueue(chunk);
      else controller.close();
    },
  });
  return new Request("https://v2.example.test/api/resource", {
    method: "POST",
    body,
    headers: { "content-type": "application/json", ...headers },
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

test("trace IDs accept only non-zero 32-digit hexadecimal values", () => {
  assert.equal(validateTraceId(TRACE_ID.toUpperCase()), TRACE_ID);
  assert.equal(validateTraceId("0".repeat(32)), undefined);
  assert.equal(validateTraceId(`${TRACE_ID}\r\nset-cookie:x`), undefined);
  assert.equal(validateTraceId(TRACE_ID.slice(1)), undefined);
  assert.equal(validateTraceId({ traceId: TRACE_ID }), undefined);
});

test("traceparent parsing pins version 00 and rejects ambiguous or zero identifiers", () => {
  assert.equal(traceIdFromTraceparent(`00-${TRACE_ID}-${PARENT_ID}-01`), TRACE_ID);
  assert.equal(traceIdFromTraceparent(`01-${TRACE_ID}-${PARENT_ID}-01`), undefined);
  assert.equal(traceIdFromTraceparent(`00-${"0".repeat(32)}-${PARENT_ID}-01`), undefined);
  assert.equal(traceIdFromTraceparent(`00-${TRACE_ID}-${"0".repeat(16)}-01`), undefined);
  assert.equal(traceIdFromTraceparent(`00-${TRACE_ID}-${PARENT_ID}-01-extra`), undefined);
});

test("validated trace extraction does not fall back around a malformed traceparent", () => {
  assert.equal(
    readValidatedTraceId(
      new Headers({ traceparent: `00-${TRACE_ID}-${PARENT_ID}-01`, "x-trace-id": "f".repeat(32) }),
    ),
    TRACE_ID,
  );
  assert.equal(
    readValidatedTraceId(
      new Headers({ traceparent: "malformed", "x-trace-id": TRACE_ID }),
    ),
    undefined,
  );
  assert.equal(readValidatedTraceId(new Headers({ "x-trace-id": TRACE_ID })), TRACE_ID);
});

test("public problem definitions reject unsafe public fields", () => {
  assert.throws(
    () => definePublicProblem({ code: "bad-code", status: 400, title: "제목", detail: "설명" }),
    /upper-snake-case/,
  );
  assert.throws(
    () =>
      definePublicProblem({
        code: "BAD_STATUS",
        status: 200,
        title: "제목",
        detail: "설명",
      }),
    /HTTP error status/,
  );
  assert.throws(
    () =>
      definePublicProblem({
        code: "BAD_DETAIL",
        status: 400,
        title: "제목",
        detail: "SQL 오류\nSELECT * FROM secret",
      }),
    /safe public text/,
  );
  assert.throws(
    () =>
      definePublicProblem({
        code: "BAD_TITLE",
        status: 400,
        title: `x${"a".repeat(120)}`,
        detail: "설명",
      }),
    /safe public text/,
  );
});

test("problem responses expose only the fixed public contract and validated trace ID", async () => {
  const response = problemResponse(HTTP_PROBLEMS.invalidJson, {
    traceId: TRACE_ID.toUpperCase(),
    headers: {
      "cache-control": "public, max-age=86400",
      "content-type": "text/html",
      "x-trace-id": "attacker-controlled",
    },
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(response.headers.get("content-type"), "application/problem+json; charset=utf-8");
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-trace-id"), TRACE_ID);
  assert.deepEqual(body, {
    type: "urn:klol:problem:invalid-json",
    title: "JSON 형식이 올바르지 않습니다.",
    status: 400,
    detail: "JSON 문법을 확인한 뒤 다시 전송해 주세요.",
    code: "INVALID_JSON",
    traceId: TRACE_ID,
  });
});

test("forged problem objects fall back without leaking stack, SQL, or extra fields", async () => {
  const error = new Error("SELECT password_hash FROM auth_accounts");
  const forged = {
    code: "DATABASE_ERROR",
    title: error.message,
    detail: error.stack,
    status: 500,
    sql: "SELECT * FROM secret",
  };
  const response = problemResponse(forged as never, {
    traceId: `${TRACE_ID}\nstack`,
  });
  const serialized = await response.text();

  assert.equal(response.status, 500);
  assert.equal(response.headers.has("x-trace-id"), false);
  assert.equal(serialized.includes("SELECT"), false);
  assert.equal(serialized.includes("password_hash"), false);
  assert.equal(serialized.includes("stack"), false);
  assert.deepEqual(JSON.parse(serialized), {
    type: "urn:klol:problem:internal-error",
    title: "요청을 처리하지 못했습니다.",
    status: 500,
    detail: "잠시 후 다시 시도해 주세요.",
    code: "INTERNAL_ERROR",
  });
});

test("no-store response helpers enforce API security headers over caller overrides", async () => {
  const headers = noStoreSecurityHeaders({
    headers: {
      "cache-control": "public",
      "content-security-policy": "default-src *",
      "x-frame-options": "SAMEORIGIN",
      "x-trace-id": TRACE_ID,
      "x-custom": "retained",
    },
    traceId: "invalid",
  });
  assert.equal(headers.get("cache-control"), "no-store, max-age=0");
  assert.equal(headers.get("content-security-policy"), "default-src 'none'; frame-ancestors 'none'; sandbox");
  assert.equal(headers.get("cross-origin-resource-policy"), "same-origin");
  assert.equal(headers.get("referrer-policy"), "no-referrer");
  assert.equal(headers.get("x-frame-options"), "DENY");
  assert.equal(headers.get("x-trace-id"), null);
  assert.equal(headers.get("x-custom"), "retained");

  const response = noStoreJsonResponse({ success: true }, { status: 201, traceId: TRACE_ID });
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
  assert.equal(response.headers.get("x-trace-id"), TRACE_ID);
  assert.deepEqual(await response.json(), { success: true });
});

test("JSON content types allow UTF-8 JSON and structured +json only", () => {
  assert.equal(isSupportedJsonContentType("application/json"), true);
  assert.equal(isSupportedJsonContentType("Application/JSON; Charset=\"UTF-8\""), true);
  assert.equal(isSupportedJsonContentType("application/vnd.klol.command+json; charset=utf-8"), true);
  assert.equal(isSupportedJsonContentType(null), false);
  assert.equal(isSupportedJsonContentType("text/json"), false);
  assert.equal(isSupportedJsonContentType("application/json-p"), false);
  assert.equal(isSupportedJsonContentType("application/json, text/plain"), false);
  assert.equal(isSupportedJsonContentType("application/json; charset=utf-8; charset=utf-8"), false);
  assert.equal(isSupportedJsonContentType("application/json; charset=iso-8859-1"), false);
  assert.equal(isSupportedJsonContentType("application/json; profile=unsafe"), false);
});

test("JSON body reader preserves split UTF-8 code points and reports actual bytes", async () => {
  const encoded = new TextEncoder().encode('{"name":"아리"}');
  const result = await readJsonBody(
    streamRequest([
      encoded.slice(0, 10),
      encoded.slice(10, 11),
      encoded.slice(11),
    ]),
    { maximumBytes: encoded.byteLength },
  );

  assert.deepEqual(result, {
    ok: true,
    bytesRead: encoded.byteLength,
    value: { name: "아리" },
  });
});

test("JSON body reader separates media type, empty body, UTF-8, and JSON errors", async () => {
  assert.deepEqual(await readJsonBody(new Request("https://v2.example.test", { method: "POST" })), {
    ok: false,
    error: "UNSUPPORTED_MEDIA_TYPE",
  });
  assert.deepEqual(await readJsonBody(jsonRequest(null)), { ok: false, error: "EMPTY_BODY" });
  assert.deepEqual(await readJsonBody(jsonRequest("   ")), { ok: false, error: "EMPTY_BODY" });
  assert.deepEqual(await readJsonBody(jsonRequest('{"broken":}')), {
    ok: false,
    error: "INVALID_JSON",
  });
  assert.deepEqual(await readJsonBody(streamRequest([Uint8Array.of(0x7b, 0xc3, 0x28, 0x7d)])), {
    ok: false,
    error: "INVALID_UTF8",
  });
});

test("JSON body reader enforces declared and streamed byte limits", async () => {
  const exact = await readJsonBody(jsonRequest("1234"), { maximumBytes: 4 });
  const declaredTooLarge = await readJsonBody(jsonRequest("{}", { "content-length": "99" }), {
    maximumBytes: 8,
  });
  const streamedTooLarge = await readJsonBody(streamRequest([new TextEncoder().encode("[12345]")] ), {
    maximumBytes: 6,
  });

  assert.deepEqual(exact, { ok: true, bytesRead: 4, value: 1234 });
  assert.deepEqual(declaredTooLarge, { ok: false, error: "BODY_TOO_LARGE" });
  assert.deepEqual(streamedTooLarge, { ok: false, error: "BODY_TOO_LARGE" });
});

test("JSON body reader rejects malformed and mismatched Content-Length", async () => {
  assert.deepEqual(await readJsonBody(jsonRequest("{}", { "content-length": "02" })), {
    ok: false,
    error: "INVALID_CONTENT_LENGTH",
  });
  assert.deepEqual(await readJsonBody(jsonRequest("{}", { "content-length": "3" })), {
    ok: false,
    error: "INVALID_CONTENT_LENGTH",
  });
  assert.deepEqual(await readJsonBody(jsonRequest("{}", { "content-length": "1, 2" })), {
    ok: false,
    error: "INVALID_CONTENT_LENGTH",
  });
});

test("JSON body reader reports stream failures and rejects unsafe limit configuration", async () => {
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.error(new Error("private transport detail"));
    },
  });
  const request = new Request("https://v2.example.test", {
    method: "POST",
    body,
    headers: { "content-type": "application/json" },
    duplex: "half",
  } as RequestInit & { duplex: "half" });

  assert.deepEqual(await readJsonBody(request), { ok: false, error: "BODY_READ_FAILED" });
  await assert.rejects(() => readJsonBody(jsonRequest("{}"), { maximumBytes: 0 }), RangeError);
  await assert.rejects(
    () => readJsonBody(jsonRequest("{}"), { maximumBytes: MAXIMUM_JSON_BODY_LIMIT_BYTES + 1 }),
    RangeError,
  );
});

test("JSON body reader cancels a rejected unread stream without exposing its data", async () => {
  let cancelledWith: unknown;
  const body = new ReadableStream<Uint8Array>({
    cancel(reason) {
      cancelledWith = reason;
    },
  });
  const request = new Request("https://v2.example.test", {
    method: "POST",
    body,
    headers: { "content-type": "text/plain" },
    duplex: "half",
  } as RequestInit & { duplex: "half" });

  assert.deepEqual(await readJsonBody(request), {
    ok: false,
    error: "UNSUPPORTED_MEDIA_TYPE",
  });
  assert.equal(cancelledWith, "request body rejected before reading");
});

test("problem mappings keep parser failures on the reviewed public catalog", () => {
  assert.equal(problemForJsonBodyError("INVALID_UTF8"), HTTP_PROBLEMS.invalidUtf8);
  assert.equal(problemForJsonBodyError("BODY_TOO_LARGE"), HTTP_PROBLEMS.bodyTooLarge);
  assert.equal(
    problemForIdempotencyKeyError("MISSING"),
    HTTP_PROBLEMS.missingIdempotencyKey,
  );
  assert.equal(
    problemForIdempotencyKeyError("INVALID"),
    HTTP_PROBLEMS.invalidIdempotencyKey,
  );
  assert.equal(problemForIfMatchRevisionError("MISSING"), HTTP_PROBLEMS.preconditionRequired);
  assert.equal(problemForIfMatchRevisionError("INVALID"), HTTP_PROBLEMS.invalidIfMatch);
  assert.equal(problemForPaginationError("DUPLICATE_LIMIT"), HTTP_PROBLEMS.invalidPagination);
});

test("Idempotency-Key parsing is strict, bounded, and case preserving", () => {
  assert.deepEqual(readIdempotencyKey(new Headers()), { ok: false, error: "MISSING" });

  const keyValue = "Request-1234567890-ABC";
  const valid = readIdempotencyKey(new Headers({ "idempotency-key": keyValue }));
  assert.deepEqual(valid, { ok: true, key: { normalized: keyValue } });
  assert.deepEqual(
    readIdempotencyKey(new Headers({ "idempotency-key": "short" })),
    { ok: false, error: "INVALID" },
  );
  assert.deepEqual(
    readIdempotencyKey(new Headers({ "idempotency-key": `${keyValue} embedded-space` })),
    { ok: false, error: "INVALID" },
  );
  assert.deepEqual(
    readIdempotencyKey(new Headers({ "idempotency-key": `${keyValue},second-key-123456` })),
    { ok: false, error: "INVALID" },
  );
  assert.deepEqual(
    readIdempotencyKey(new Headers({ "idempotency-key": `é-${"a".repeat(20)}` })),
    { ok: false, error: "INVALID" },
  );
  assert.deepEqual(
    readIdempotencyKey(new Headers({ "idempotency-key": "a".repeat(129) })),
    { ok: false, error: "INVALID" },
  );
});

test("idempotency hash material is deterministic and domain separated", () => {
  const parsed = readIdempotencyKey(
    new Headers({ "idempotency-key": "Request-1234567890-ABC" }),
  );
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const first = idempotencyHashMaterial(parsed.key, "players:create");
  const repeated = idempotencyHashMaterial(parsed.key, "players:create");
  const otherScope = idempotencyHashMaterial(parsed.key, "players:update");
  assert.deepEqual(first, repeated);
  assert.notDeepEqual(first, otherScope);
  assert.match(new TextDecoder().decode(first), /^klol-v2:idempotency:v1\0players:create\0/);
  assert.throws(() => idempotencyHashMaterial(parsed.key, "Players Create"), /lower-case/);
  assert.throws(
    () => idempotencyHashMaterial({ normalized: "forged" }, "players:create"),
    /invalid/,
  );
});

test("revision parsing accepts canonical non-negative safe integers including schema default 0", () => {
  assert.deepEqual(parseRevision(0), { ok: true, revision: 0 });
  assert.deepEqual(parseRevision(1), { ok: true, revision: 1 });
  assert.deepEqual(parseRevision("42"), { ok: true, revision: 42 });
  assert.deepEqual(parseRevision(undefined), { ok: false, error: "MISSING" });
  assert.deepEqual(parseRevision(""), { ok: false, error: "MISSING" });

  assert.deepEqual(parseRevision("0"), { ok: true, revision: 0 });
  for (const invalid of [-1, 1.5, "-0", "01", "+1", "1e2", " 1", true, 2 ** 53]) {
    assert.deepEqual(parseRevision(invalid), { ok: false, error: "INVALID" });
  }
});

test("If-Match parsing requires one strong integer revision ETag", () => {
  assert.deepEqual(readIfMatchRevision(new Headers({ "if-match": '"0"' })), {
    ok: true,
    revision: 0,
  });
  assert.deepEqual(readIfMatchRevision(new Headers({ "if-match": '"42"' })), {
    ok: true,
    revision: 42,
  });
  assert.deepEqual(readIfMatchRevision(new Headers()), { ok: false, error: "MISSING" });

  for (const invalid of ["42", 'W/"42"', "*", '"01"', '"1", "2"', '"-1"', '"2" extra']) {
    assert.deepEqual(readIfMatchRevision(new Headers({ "if-match": invalid })), {
      ok: false,
      error: "INVALID",
    });
  }
  assert.equal(formatRevisionEtag(0), '"0"');
  assert.equal(formatRevisionEtag(42), '"42"');
  assert.throws(() => formatRevisionEtag(-1), RangeError);
});

test("pagination parsing applies defaults and explicit upper bounds", () => {
  assert.deepEqual(parsePaginationInput(new URLSearchParams()), {
    ok: true,
    value: { limit: 20 },
  });
  assert.deepEqual(parsePaginationInput(new URLSearchParams("cursor=YWJj&limit=40"), {
    defaultLimit: 10,
    maximumLimit: 50,
  }), {
    ok: true,
    value: { cursor: "YWJj", limit: 40 },
  });
  assert.deepEqual(parsePaginationInput(new URLSearchParams("limit=51"), { maximumLimit: 50 }), {
    ok: false,
    error: "INVALID_LIMIT",
  });
});

test("pagination rejects duplicate, ambiguous, oversized, and attack-shaped values", () => {
  assert.deepEqual(parsePaginationInput(new URLSearchParams("cursor=YWJj&cursor=ZGVm")), {
    ok: false,
    error: "DUPLICATE_CURSOR",
  });
  assert.deepEqual(parsePaginationInput(new URLSearchParams("limit=10&limit=20")), {
    ok: false,
    error: "DUPLICATE_LIMIT",
  });

  for (const cursor of ["", "a", "abc=", "../secret", "YWJj%0d%0aX-Test:yes", "a".repeat(MAXIMUM_CURSOR_LENGTH + 1)]) {
    assert.deepEqual(parsePaginationInput(new URLSearchParams({ cursor })), {
      ok: false,
      error: "INVALID_CURSOR",
    });
  }
  for (const limit of ["0", "01", "1.5", "1e2", " 10", "101", "9999"]) {
    assert.deepEqual(parsePaginationInput(new URLSearchParams({ limit })), {
      ok: false,
      error: "INVALID_LIMIT",
    });
  }
});

test("pagination rejects unsafe parser configuration", () => {
  assert.throws(
    () => parsePaginationInput(new URLSearchParams(), { defaultLimit: 51, maximumLimit: 50 }),
    RangeError,
  );
  assert.throws(
    () => parsePaginationInput(new URLSearchParams(), { maximumLimit: 101 }),
    RangeError,
  );
});
