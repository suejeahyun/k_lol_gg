import assert from "node:assert/strict";
import test from "node:test";

import {
  buildVercelKakaoDailyCloseInput,
  verifyVercelCronBearer,
} from "../src/modules/operations/infrastructure/vercel-kakao-daily-close";

test("Vercel cron accepts only the exact timing-safe Bearer secret", () => {
  const secret = "synthetic-cron-secret-with-at-least-32-characters";
  assert.equal(verifyVercelCronBearer(`Bearer ${secret}`, secret), true);
  assert.equal(verifyVercelCronBearer(`bearer ${secret}`, secret), false);
  assert.equal(verifyVercelCronBearer(`Bearer ${secret}x`, secret), false);
  assert.equal(verifyVercelCronBearer(null, secret), false);
  assert.equal(verifyVercelCronBearer(`Bearer ${"s".repeat(31)}`, "s".repeat(31)), false);
  assert.equal(verifyVercelCronBearer("Bearer short", "short"), false);
  assert.equal(verifyVercelCronBearer("Bearer undefined", undefined), false);
});

test("daily close identity changes at 06:00 KST and remains stable for delayed retries", () => {
  const before = buildVercelKakaoDailyCloseInput(new Date("2026-09-12T05:59:59.999+09:00"));
  const boundary = buildVercelKakaoDailyCloseInput(new Date("2026-09-12T06:00:00.000+09:00"));
  const after = buildVercelKakaoDailyCloseInput(new Date("2026-09-12T06:01:00.000+09:00"));
  const delayed = buildVercelKakaoDailyCloseInput(new Date("2026-09-12T23:59:00.000+09:00"));
  const nextBoundary = buildVercelKakaoDailyCloseInput(new Date("2026-09-13T06:00:00.000+09:00"));

  assert.notEqual(before.nonce, boundary.nonce);
  assert.deepEqual(after, boundary);
  assert.deepEqual(delayed, boundary);
  assert.notEqual(nextBoundary.nonce, boundary.nonce);
  assert.equal(boundary.idleHours, 12);
  assert.equal(boundary.maximumClosures, 500);
  assert.match(boundary.nonce, /^[A-Za-z0-9_-]{16,100}$/u);
  assert.match(boundary.requestHashHex, /^[a-f0-9]{64}$/u);
  assert.match(boundary.requestId, /^[a-f0-9]{8}-[a-f0-9]{4}-8[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u);
});

test("invalid cron clocks fail closed before any repository input is made", () => {
  assert.throws(() => buildVercelKakaoDailyCloseInput(new Date(Number.NaN)), /INVALID_CRON_TIME/u);
});
