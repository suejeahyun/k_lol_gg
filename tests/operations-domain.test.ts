import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { authorizeAiRequest, buildCsvBackup, toPublicSiteSettingsDto, updateSiteSettings, type SiteSettings } from "../src/modules/operations";
import { signJobRequest, verifyJobRequest } from "../src/modules/operations/infrastructure/job-signature";

const settings: SiteSettings = {
  revision: 1,
  brandName: "K-LOL.GG",
  tagline: "함께 만드는 내전",
  supportUrl: null,
  features: { registrations: true, matchSubmissions: true, teamBalance: true, kakaoHelp: true, riotIntegration: false, aiAssistant: false },
  aiAllowedRoles: ["ADMIN", "SUPER_ADMIN"],
  internalMaintenanceNote: "private note",
};

test("site settings update is revision-bound and public DTO is allowlisted", () => {
  const updated = updateSiteSettings({ current: settings, expectedRevision: 1, patch: { supportUrl: "https://support.example/help", features: { riotIntegration: true } } });
  assert.equal(updated.revision, 2);
  assert.equal(updated.features.riotIntegration, true);
  const dto = toPublicSiteSettingsDto(updated);
  assert.deepEqual(Object.keys(dto).sort(), ["brandName", "features", "supportUrl", "tagline"]);
  assert.equal(JSON.stringify(dto).includes("private note"), false);
  assert.throws(() => updateSiteSettings({ current: settings, expectedRevision: 0, patch: {} }), /STALE_SITE_SETTINGS_REVISION/);
  assert.throws(() => updateSiteSettings({ current: settings, expectedRevision: 1, patch: { supportUrl: "http://unsafe.test" } }), /INVALID_SUPPORT_URL/);
});

test("AI is hard-disabled first, then checks approval, role, rate and prompt", () => {
  assert.deepEqual(authorizeAiRequest({ settings, accountStatus: "APPROVED", role: "ADMIN", prompt: "hello", usedInWindow: 0, maximumInWindow: 10 }), { allowed: false, code: "AI_DISABLED" });
  const enabled = { ...settings, features: { ...settings.features, aiAssistant: true } };
  assert.deepEqual(authorizeAiRequest({ settings: enabled, accountStatus: "PENDING", role: "ADMIN", prompt: "hello", usedInWindow: 0, maximumInWindow: 10 }), { allowed: false, code: "ACCOUNT_NOT_APPROVED" });
  assert.deepEqual(authorizeAiRequest({ settings: enabled, accountStatus: "APPROVED", role: "USER", prompt: "hello", usedInWindow: 0, maximumInWindow: 10 }), { allowed: false, code: "AI_ROLE_FORBIDDEN" });
  assert.deepEqual(authorizeAiRequest({ settings: enabled, accountStatus: "APPROVED", role: "ADMIN", prompt: " hello ", usedInWindow: 0, maximumInWindow: 10 }), { allowed: true, normalizedPrompt: "hello" });
});

test("CSV backup quotes fields and neutralizes spreadsheet formulas", () => {
  const csv = buildCsvBackup({ columns: [{ header: "name", value: (row: { name: string }) => row.name }, { header: "memo", value: (row: { memo: string }) => row.memo }], rows: [{ name: "=CMD()", memo: "hello,\nworld" }] });
  assert.equal(csv, "\uFEFFname,memo\r\n'=CMD(),\"hello,\nworld\"\r\n");
});

test("internal job signature is scoped, expiring and nonce replay aware", () => {
  const now = new Date("2026-09-07T06:00:00.000Z");
  const unsigned = { method: "POST" as const, path: "/api/internal/jobs/maintenance", timestampSeconds: Math.floor(now.getTime() / 1_000), nonce: "nonce_1234567890abcdef", bodyDigestHex: createHash("sha256").update("{}").digest("hex") };
  const secret = "x".repeat(32);
  const request = { ...unsigned, signatureHex: signJobRequest(unsigned, secret) };
  assert.deepEqual(verifyJobRequest({ request, secret, now, nonceAlreadyUsed: false }), { ok: true });
  assert.deepEqual(verifyJobRequest({ request, secret, now, nonceAlreadyUsed: true }), { ok: false, code: "JOB_NONCE_REPLAYED" });
  assert.deepEqual(verifyJobRequest({ request: { ...request, signatureHex: "0".repeat(64) }, secret, now, nonceAlreadyUsed: false }), { ok: false, code: "JOB_SIGNATURE_INVALID" });
  assert.deepEqual(verifyJobRequest({ request, secret, now: new Date(now.getTime() + 301_000), nonceAlreadyUsed: false }), { ok: false, code: "JOB_SIGNATURE_EXPIRED" });
});
