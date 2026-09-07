import { MATCH_IMAGE_MAX_BYTES } from "../domain/match";

export type MatchUploadBodyError = "LENGTH" | "READ" | "TIMEOUT";

export async function readExactUploadBody(
  request: Request,
  expectedBytes: number,
  limits: Readonly<{ totalTimeoutMs?: number; idleTimeoutMs?: number }> = {},
) {
  if (!request.body || request.bodyUsed) return { ok: false as const, error: "READ" as const };
  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try {
    reader = request.body.getReader();
  } catch {
    return { ok: false as const, error: "READ" as const };
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  const totalTimeoutMs = limits.totalTimeoutMs ?? 20_000;
  const idleTimeoutMs = limits.idleTimeoutMs ?? 5_000;
  if (
    !Number.isInteger(totalTimeoutMs) ||
    !Number.isInteger(idleTimeoutMs) ||
    totalTimeoutMs < 1 ||
    idleTimeoutMs < 1 ||
    totalTimeoutMs > 60_000 ||
    idleTimeoutMs > totalTimeoutMs
  ) {
    await reader.cancel("invalid upload deadline configuration").catch(() => undefined);
    reader.releaseLock();
    return { ok: false as const, error: "READ" as const };
  }
  const deadline = Date.now() + totalTimeoutMs;
  try {
    while (true) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        await reader.cancel("upload body total deadline exceeded").catch(() => undefined);
        return { ok: false as const, error: "TIMEOUT" as const };
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<"TIMEOUT">((resolve) => {
        timer = setTimeout(() => resolve("TIMEOUT"), Math.min(idleTimeoutMs, remaining));
      });
      const chunk = await Promise.race([reader.read(), timeout]);
      if (timer) clearTimeout(timer);
      if (chunk === "TIMEOUT") {
        await reader.cancel("upload body idle deadline exceeded").catch(() => undefined);
        return { ok: false as const, error: "TIMEOUT" as const };
      }
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > expectedBytes || total > MATCH_IMAGE_MAX_BYTES) {
        await reader.cancel("upload body exceeded declaration").catch(() => undefined);
        return { ok: false as const, error: "LENGTH" as const };
      }
      chunks.push(chunk.value);
    }
  } catch {
    return { ok: false as const, error: "READ" as const };
  } finally {
    reader.releaseLock();
  }
  if (total !== expectedBytes) return { ok: false as const, error: "LENGTH" as const };
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true as const, bytes };
}
