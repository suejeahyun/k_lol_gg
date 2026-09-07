import { createHmac, timingSafeEqual } from "node:crypto";

export type SignedJobRequest = Readonly<{
  method: "POST";
  path: string;
  timestampSeconds: number;
  nonce: string;
  bodyDigestHex: string;
  signatureHex: string;
}>;

function canonicalMessage(request: Omit<SignedJobRequest, "signatureHex">): string {
  if (!request.path.startsWith("/api/internal/jobs/") || request.path.includes("?") || request.path.includes("#")) {
    throw new Error("INVALID_JOB_PATH");
  }
  if (!Number.isSafeInteger(request.timestampSeconds) || request.timestampSeconds < 0) throw new Error("INVALID_JOB_TIMESTAMP");
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(request.nonce)) throw new Error("INVALID_JOB_NONCE");
  if (!/^[a-f0-9]{64}$/.test(request.bodyDigestHex)) throw new Error("INVALID_JOB_BODY_DIGEST");
  return [request.method, request.path, request.timestampSeconds, request.nonce, request.bodyDigestHex].join("\n");
}

export function signJobRequest(
  request: Omit<SignedJobRequest, "signatureHex">,
  secret: string,
): string {
  if (secret.length < 32) throw new Error("JOB_SECRET_TOO_SHORT");
  return createHmac("sha256", secret).update(canonicalMessage(request)).digest("hex");
}

export function verifyJobRequest(input: Readonly<{
  request: SignedJobRequest;
  secret: string;
  now: Date;
  maximumSkewSeconds?: number;
  nonceAlreadyUsed: boolean;
}>): Readonly<{ ok: true }> | Readonly<{ ok: false; code: string }> {
  if (input.nonceAlreadyUsed) return { ok: false, code: "JOB_NONCE_REPLAYED" };
  if (!Number.isFinite(input.now.getTime())) return { ok: false, code: "JOB_TIME_INVALID" };
  const maximumSkew = input.maximumSkewSeconds ?? 300;
  if (!Number.isSafeInteger(maximumSkew) || maximumSkew < 30 || maximumSkew > 900) {
    return { ok: false, code: "JOB_POLICY_INVALID" };
  }
  if (Math.abs(Math.floor(input.now.getTime() / 1_000) - input.request.timestampSeconds) > maximumSkew) {
    return { ok: false, code: "JOB_SIGNATURE_EXPIRED" };
  }
  let expected: string;
  try {
    expected = signJobRequest(input.request, input.secret);
  } catch {
    return { ok: false, code: "JOB_SIGNATURE_INVALID" };
  }
  if (!/^[a-f0-9]{64}$/.test(input.request.signatureHex)) return { ok: false, code: "JOB_SIGNATURE_INVALID" };
  const matches = timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(input.request.signatureHex, "hex"));
  return matches ? { ok: true } : { ok: false, code: "JOB_SIGNATURE_INVALID" };
}
