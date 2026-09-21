import { createHash } from "node:crypto";
import { noStoreJsonResponse, readValidatedTraceId } from "@/platform/http";
import { readBoundedKakaoRawBody } from "@/modules/recruiting/infrastructure/kakao-http-request";
import { getRuntimeKakaoV4SigningSecrets } from "@/modules/recruiting/kakao-v4/installation-scope";
import { parseSiteNoticeRequest, siteNoticeConfig, SITE_NOTICE_CONTRACT, verifySiteNoticeRequest, type SiteNoticeConfig, type SiteNoticeRequest } from "./domain";
import { SiteNoticeLeaseError, SiteNoticeReplayError } from "./repository";

export async function handleSiteNoticeRequest(request: Request,
  execute: (envelope: SiteNoticeRequest, config: SiteNoticeConfig, keyId: string, digest: Buffer, now: Date) => Promise<unknown>,
  environment: Readonly<Record<string, string | undefined>> = process.env,
  now = new Date(),
) {
  const traceId = readValidatedTraceId(request.headers);
  const response = (status: number, code: string) => noStoreJsonResponse({ code }, { status, traceId });
  const config = siteNoticeConfig(environment);
  if (!config) return response(503, "SITE_NOTICES_DISABLED");
  if (new URL(request.url).searchParams.size || !/^application\/json(?:\s*;|$)/iu.test(request.headers.get("content-type") ?? "")) return response(400, "REQUEST_INVALID");
  const rawBody = await readBoundedKakaoRawBody(request, 4096);
  if (!rawBody) return response(400, "REQUEST_INVALID");
  let value: unknown;
  try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawBody)); } catch { return response(400, "REQUEST_INVALID"); }
  const envelope = parseSiteNoticeRequest(value);
  if (!envelope) return response(400, "REQUEST_INVALID");
  const keyId = request.headers.get("x-klol-key-id") ?? "";
  if (!verifySiteNoticeRequest({ request: envelope, config, rawBody, keyId, now,
    signature: request.headers.get("x-klol-signature") ?? "", secrets: getRuntimeKakaoV4SigningSecrets(environment) })) return response(401, "AUTHENTICATION_FAILED");
  try {
    const result = await execute(envelope, config, keyId, createHash("sha256").update(rawBody).digest(), now);
    return noStoreJsonResponse({ contract: SITE_NOTICE_CONTRACT, ...(result as Record<string, unknown>) }, { traceId });
  } catch (error) {
    if (error instanceof SiteNoticeReplayError) return response(409, "NONCE_REPLAYED");
    if (error instanceof SiteNoticeLeaseError) return response(409, "LEASE_INVALID");
    // Deliberately do not log request bodies, identifiers, secrets, or DB errors.
    console.error("KAKAO_SITE_NOTICE_UNAVAILABLE", { traceId: traceId ?? null });
    return response(503, "SITE_NOTICES_UNAVAILABLE");
  }
}
