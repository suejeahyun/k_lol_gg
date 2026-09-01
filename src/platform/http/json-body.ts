export const DEFAULT_JSON_BODY_LIMIT_BYTES = 64 * 1024;
export const MAXIMUM_JSON_BODY_LIMIT_BYTES = 1024 * 1024;

export type JsonBodyReadError =
  | "BODY_READ_FAILED"
  | "BODY_TOO_LARGE"
  | "EMPTY_BODY"
  | "INVALID_CONTENT_LENGTH"
  | "INVALID_JSON"
  | "INVALID_UTF8"
  | "UNSUPPORTED_MEDIA_TYPE";

export type JsonBodyReadResult =
  | { ok: true; bytesRead: number; value: unknown }
  | { ok: false; error: JsonBodyReadError };

const JSON_MEDIA_TYPE_PATTERN = /^application\/(?:json|[!#$%&'*+.^_`|~0-9a-z-]+\+json)$/i;
const CONTENT_LENGTH_PATTERN = /^(?:0|[1-9][0-9]{0,15})$/;

export function isSupportedJsonContentType(value: string | null) {
  if (!value) return false;

  const parts = value.split(";");
  const mediaType = parts.shift()?.trim() ?? "";
  if (!JSON_MEDIA_TYPE_PATTERN.test(mediaType)) return false;

  let charsetSeen = false;
  for (const rawParameter of parts) {
    const separator = rawParameter.indexOf("=");
    if (separator < 1) return false;

    const name = rawParameter.slice(0, separator).trim().toLowerCase();
    let parameterValue = rawParameter.slice(separator + 1).trim().toLowerCase();
    if (parameterValue.startsWith('"') && parameterValue.endsWith('"')) {
      parameterValue = parameterValue.slice(1, -1);
    }

    if (name !== "charset" || charsetSeen || parameterValue !== "utf-8") return false;
    charsetSeen = true;
  }

  return true;
}

function validateBodyLimit(maximumBytes: number) {
  if (
    !Number.isSafeInteger(maximumBytes) ||
    maximumBytes < 1 ||
    maximumBytes > MAXIMUM_JSON_BODY_LIMIT_BYTES
  ) {
    throw new RangeError(
      `maximumBytes must be between 1 and ${MAXIMUM_JSON_BODY_LIMIT_BYTES}`,
    );
  }
}

function declaredContentLength(headers: Headers): number | "INVALID_CONTENT_LENGTH" | undefined {
  const rawValue = headers.get("content-length");
  if (rawValue === null) return undefined;
  if (!CONTENT_LENGTH_PATTERN.test(rawValue)) return "INVALID_CONTENT_LENGTH";

  const value = Number(rawValue);
  return Number.isSafeInteger(value) ? value : "INVALID_CONTENT_LENGTH";
}

async function cancelReader(reader: ReadableStreamDefaultReader<Uint8Array>) {
  await reader.cancel("request body rejected").catch(() => undefined);
}

async function cancelUnreadBody(request: Request) {
  if (!request.body || request.body.locked) return;
  await request.body.cancel("request body rejected before reading").catch(() => undefined);
}

export async function readJsonBody(
  request: Request,
  options: { maximumBytes?: number } = {},
): Promise<JsonBodyReadResult> {
  const maximumBytes = options.maximumBytes ?? DEFAULT_JSON_BODY_LIMIT_BYTES;
  validateBodyLimit(maximumBytes);

  if (!isSupportedJsonContentType(request.headers.get("content-type"))) {
    await cancelUnreadBody(request);
    return { ok: false, error: "UNSUPPORTED_MEDIA_TYPE" };
  }

  const declaredLength = declaredContentLength(request.headers);
  if (declaredLength === "INVALID_CONTENT_LENGTH") {
    await cancelUnreadBody(request);
    return { ok: false, error: declaredLength };
  }
  if (declaredLength !== undefined && declaredLength > maximumBytes) {
    await cancelUnreadBody(request);
    return { ok: false, error: "BODY_TOO_LARGE" };
  }
  if (!request.body) return { ok: false, error: "EMPTY_BODY" };
  if (request.bodyUsed) return { ok: false, error: "BODY_READ_FAILED" };

  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try {
    reader = request.body.getReader();
  } catch {
    return { ok: false, error: "BODY_READ_FAILED" };
  }
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytesRead = 0;
  let text = "";

  try {
    while (true) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch {
        return { ok: false, error: "BODY_READ_FAILED" };
      }
      if (chunk.done) break;

      bytesRead += chunk.value.byteLength;
      if (bytesRead > maximumBytes) {
        await cancelReader(reader);
        return { ok: false, error: "BODY_TOO_LARGE" };
      }

      try {
        text += decoder.decode(chunk.value, { stream: true });
      } catch {
        await cancelReader(reader);
        return { ok: false, error: "INVALID_UTF8" };
      }
    }

    try {
      text += decoder.decode();
    } catch {
      return { ok: false, error: "INVALID_UTF8" };
    }
  } finally {
    reader.releaseLock();
  }

  if (declaredLength !== undefined && declaredLength !== bytesRead) {
    return { ok: false, error: "INVALID_CONTENT_LENGTH" };
  }
  if (text.trim().length === 0) return { ok: false, error: "EMPTY_BODY" };

  try {
    return { ok: true, bytesRead, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, error: "INVALID_JSON" };
  }
}
