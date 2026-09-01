type BodyReadResult =
  | { ok: true; text: string }
  | { ok: false; reason: "TOO_LARGE" | "INVALID_ENCODING" };

export function hasSameOrigin(request: Request, configuredPublicOrigin?: string) {
  const suppliedOrigin = request.headers.get("origin");
  if (!suppliedOrigin) return false;

  try {
    const expectedOrigin = configuredPublicOrigin
      ? new URL(configuredPublicOrigin).origin
      : new URL(request.url).origin;
    return new URL(suppliedOrigin).origin === expectedOrigin;
  } catch {
    return false;
  }
}

export async function readTextBodyWithinLimit(
  request: Request,
  maximumBytes: number,
): Promise<BodyReadResult> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    return { ok: false, reason: "TOO_LARGE" };
  }

  if (!request.body) return { ok: true, text: "" };

  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let byteLength = 0;
  let text = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > maximumBytes) {
        await reader.cancel("request body limit exceeded").catch(() => undefined);
        return { ok: false, reason: "TOO_LARGE" };
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return { ok: true, text };
  } catch {
    return { ok: false, reason: "INVALID_ENCODING" };
  } finally {
    reader.releaseLock();
  }
}
