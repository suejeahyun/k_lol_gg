import { createHash, timingSafeEqual } from "node:crypto";

import type { OperationsCommandPort } from "../application/ports";
import { recruitingOperatingDateKey } from "@/modules/recruiting/domain/operating-day";

const MINIMUM_CRON_SECRET_LENGTH = 32;

function sha256(value: string) {
  return createHash("sha256").update(value).digest();
}

function deterministicUuidV8(value: string) {
  const bytes = sha256(value).subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x80;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function verifyVercelCronBearer(authorization: string | null, secret: string | undefined) {
  if (!secret || secret.length < MINIMUM_CRON_SECRET_LENGTH || !authorization) return false;
  const actualDigest = sha256(authorization);
  const expectedDigest = sha256(`Bearer ${secret}`);
  return timingSafeEqual(actualDigest, expectedDigest);
}

export function buildVercelKakaoDailyCloseInput(now: Date): Parameters<OperationsCommandPort["runSignedKakaoDailyClose"]>[0] {
  if (!Number.isFinite(now.getTime())) throw new TypeError("INVALID_CRON_TIME");
  const operatingDate = recruitingOperatingDateKey(now);
  const nonce = `vercel_kakao_daily_close_${operatingDate.replaceAll("-", "")}`;
  const requestHashHex = sha256(JSON.stringify({
    jobName: "kakao-daily-close",
    operatingDate,
    idleHours: 12,
    maximumClosures: 500,
  })).toString("hex");
  return {
    jobName: "kakao-daily-close",
    nonce,
    requestHashHex,
    requestId: deterministicUuidV8(`klol-v2:vercel-kakao-daily-close:v1\0${nonce}\0${requestHashHex}`),
    idleHours: 12,
    maximumClosures: 500,
  };
}
