import { validateTraceId } from "./trace";

export type NoStoreSecurityHeaderOptions = {
  contentType?: string;
  headers?: HeadersInit;
  traceId?: string;
};

export type NoStoreJsonResponseInit = Omit<ResponseInit, "headers"> & {
  headers?: HeadersInit;
  traceId?: string;
};

export function noStoreSecurityHeaders(options: NoStoreSecurityHeaderOptions = {}) {
  const headers = new Headers(options.headers);

  headers.set("Cache-Control", "no-store, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");
  headers.set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; sandbox");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.delete("Connection");
  headers.delete("Content-Length");
  headers.delete("Server");
  headers.delete("Transfer-Encoding");
  headers.delete("X-Powered-By");

  if (options.contentType) headers.set("Content-Type", options.contentType);

  const traceId = validateTraceId(options.traceId);
  if (traceId) headers.set("X-Trace-Id", traceId);
  else headers.delete("X-Trace-Id");

  return headers;
}

export function noStoreJsonResponse(
  body: unknown,
  init: NoStoreJsonResponseInit = {},
) {
  const { headers, traceId, ...responseInit } = init;
  return new Response(JSON.stringify(body), {
    ...responseInit,
    headers: noStoreSecurityHeaders({
      contentType: "application/json; charset=utf-8",
      headers,
      traceId,
    }),
  });
}
