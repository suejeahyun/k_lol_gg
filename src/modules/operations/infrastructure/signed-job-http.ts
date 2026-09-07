import { createHash, randomUUID } from "node:crypto";

import { readTextBodyWithinLimit } from "@/modules/auth/application/mutation-request-guard";

import { verifyJobRequest } from "./job-signature";

export async function verifyOperationsJobHttpRequest(request: Request, path: string) {
  const secret = process.env.OPERATIONS_JOB_SECRET;
  if (!secret) return { ok: false as const, code: "JOB_SECRET_UNAVAILABLE" };
  if (request.method !== "POST" || new URL(request.url).pathname !== path || new URL(request.url).search) return { ok: false as const, code: "INVALID_JOB_REQUEST" };
  const raw = await readTextBodyWithinLimit(request, 16 * 1_024);
  if (!raw.ok) return { ok: false as const, code: "INVALID_JOB_BODY" };
  const timestampSeconds = Number(request.headers.get("x-job-timestamp"));
  const nonce = request.headers.get("x-job-nonce") ?? "";
  const signatureHex = request.headers.get("x-job-signature") ?? "";
  const bodyDigestHex = createHash("sha256").update(raw.text).digest("hex");
  const verification = verifyJobRequest({
    request: { method: "POST", path, timestampSeconds, nonce, bodyDigestHex, signatureHex },
    secret,
    now: new Date(),
    nonceAlreadyUsed: false,
  });
  if (!verification.ok) return verification;
  try {
    const body: unknown = JSON.parse(raw.text || "{}");
    if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false as const, code: "INVALID_JOB_BODY" };
    return {
      ok: true as const,
      body,
      nonce,
      timestampSeconds,
      signatureHex,
      bodyDigestHex,
      requestId: randomUUID(),
    };
  } catch {
    return { ok: false as const, code: "INVALID_JOB_BODY" };
  }
}
