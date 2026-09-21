import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { kakaoV4InstallationId, kakaoV4InstallationScopeId } from "@/modules/recruiting/kakao-v4/installation-scope";
import type { KakaoWebhookSecret } from "@/modules/recruiting/infrastructure/kakao-signature";

export const SITE_NOTICE_CONTRACT = "KLOL_KAKAO_SITE_NOTICE_V1";
export const SITE_NOTICE_LEASE_MS = 120_000;
export const SITE_NOTICE_MAX_ATTEMPTS = 20;
export const SITE_NOTICE_RETENTION_MS = 30 * 86_400_000;
const hex = /^[a-f0-9]{64}$/u;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export type SiteNoticeConfig = Readonly<{ installationId: string; sourceRoomIdHash: Buffer; targetHash: Buffer }>;
export function siteNoticeConfig(environment: Readonly<Record<string, string | undefined>> = process.env): SiteNoticeConfig | null {
  const identity = environment.KAKAO_V4_IDENTITY_SECRET;
  const target = environment.KAKAO_SITE_NOTICE_TARGET_HASH;
  if (environment.KAKAO_SITE_NOTICE_ENABLED !== "true" || !identity || !target || !hex.test(target)) return null;
  const bytes = Buffer.from(identity);
  if (bytes.length < 32 || bytes.length > 1024) return null;
  // INHOUSE_CREATE/SNAPSHOT are FEATURES commands in the existing phone router.
  const installationId = kakaoV4InstallationId("FEATURES", bytes);
  return { installationId, targetHash: Buffer.from(target, "hex"), sourceRoomIdHash: createHash("sha256")
    .update(`klol-v2:kakao-season-room:v1\0${kakaoV4InstallationScopeId(installationId)}`).digest() };
}

export type SiteNoticeRequest = Readonly<{
  action: "REGISTER" | "POLL" | "ACK";
  installationId: string;
  targetHash: string;
  timestamp: number;
  nonce: string;
  eventId?: string;
  leaseToken?: string;
  outcome?: "SENT" | "RETRY" | "UNCERTAIN";
}>;

export function parseSiteNoticeRequest(value: unknown): SiteNoticeRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (!["REGISTER", "POLL", "ACK"].includes(String(input.action))) return null;
  const keys = ["action", "installationId", "targetHash", "timestamp", "nonce"];
  if (input.action === "ACK") keys.push("eventId", "leaseToken", "outcome");
  if (Object.keys(input).length !== keys.length || keys.some((key) => !(key in input))) return null;
  if (typeof input.installationId !== "string" || !/^install-[a-f0-9]{32}$/u.test(input.installationId)) return null;
  if (typeof input.targetHash !== "string" || !hex.test(input.targetHash)) return null;
  if (typeof input.nonce !== "string" || !/^[a-f0-9]{32}$/u.test(input.nonce)) return null;
  if (!Number.isSafeInteger(input.timestamp) || (input.timestamp as number) <= 0) return null;
  if (input.action === "ACK" && (typeof input.eventId !== "string" || !uuid.test(input.eventId)
    || typeof input.leaseToken !== "string" || !hex.test(input.leaseToken)
    || !["SENT", "RETRY", "UNCERTAIN"].includes(String(input.outcome)))) return null;
  return input as SiteNoticeRequest;
}

export function siteNoticeSignatureMaterial(keyId: string, rawBody: Uint8Array) {
  return `${SITE_NOTICE_CONTRACT}\n${keyId}\n${createHash("sha256").update(rawBody).digest("hex")}`;
}

export function verifySiteNoticeRequest(input: Readonly<{
  request: SiteNoticeRequest; config: SiteNoticeConfig; rawBody: Uint8Array; keyId: string;
  signature: string; secrets: readonly KakaoWebhookSecret[] | null; now: Date;
}>) {
  if (input.request.installationId !== input.config.installationId || input.request.targetHash !== input.config.targetHash.toString("hex")) return false;
  if (Math.abs(input.request.timestamp - Math.floor(input.now.getTime() / 1000)) > 300) return false;
  const secret = input.secrets?.find((entry) => entry.keyId === input.keyId);
  if (!secret || !/^notice-v1=[a-f0-9]{64}$/u.test(input.signature)) return false;
  const expected = createHmac("sha256", secret.secret).update(siteNoticeSignatureMaterial(input.keyId, input.rawBody)).digest();
  return timingSafeEqual(expected, Buffer.from(input.signature.slice(10), "hex"));
}

/** The next recruiting day starts at 06:00 KST (21:00 UTC on applyDate). */
export function siteNoticeExpiry(applyDate: string, now: Date) {
  return new Date(Math.min(now.getTime() + 86_400_000, new Date(`${applyDate}T21:00:00.000Z`).getTime()));
}
