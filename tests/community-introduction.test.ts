import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CommunityIntroductionValidationError, createDefaultCommunityIntroduction, parsePublicCommunityIntroductionDto,
  toPublicCommunityIntroductionDto, validateCommunityIntroduction,
} from "../src/modules/operations/domain/community-introduction";
import { isPublicCommunityPreviewRequest } from "../src/modules/community-sites/domain/publication-access";

const profile = () => ({ ...createDefaultCommunityIntroduction(), published: true, summary: "함께하는 게임", introduction: "소개 첫 줄\n둘째 줄" });
const snapshot = () => ({ revision: 3, updatedAt: "2026-10-29T03:00:00.000Z", profile: profile() });

test("community introduction defaults are unpublished and emit no public DTO", () => {
  const draft = createDefaultCommunityIntroduction();
  assert.equal(draft.published, false);
  assert.deepEqual(validateCommunityIntroduction(draft), draft);
  assert.equal(toPublicCommunityIntroductionDto({ revision: 0, updatedAt: null, profile: draft }, "https://community.example"), null);
  assert.equal(toPublicCommunityIntroductionDto({ ...snapshot(), profile: { ...profile(), published: false } }, "https://community.example"), null);
});

test("validation keeps multiline text literal and normalizes line endings", () => {
  assert.equal(validateCommunityIntroduction({ ...profile(), introduction: "  <b>소개</b>\r\n둘째 줄  " }).introduction, "<b>소개</b>\n둘째 줄");
  assert.throws(() => validateCommunityIntroduction({ ...profile(), summary: "제목\n두 줄" }), CommunityIntroductionValidationError);
  assert.throws(() => validateCommunityIntroduction({ ...profile(), introduction: "중간\u0000문자" }), CommunityIntroductionValidationError);
  for (const hidden of ["\u202e", "\u200b", "\u200d", "\ufeff", "\ufe0f", "\ud800", "\t"]) {
    assert.throws(() => validateCommunityIntroduction({ ...profile(), summary: `${hidden}제목` }), CommunityIntroductionValidationError);
    assert.throws(() => validateCommunityIntroduction({ ...profile(), introduction: `첫째 줄\n${hidden}둘째 줄` }), CommunityIntroductionValidationError);
  }
});

test("profile rejects missing, extra, incorrectly typed and empty public fields", () => {
  for (const value of [null, [], {}, { ...profile(), internalMaintenanceNote: "private" }, { ...profile(), published: 1 },
    { ...profile(), summary: " " }, { ...profile(), introduction: "" }, { ...profile(), activities: null }]) {
    assert.throws(() => validateCommunityIntroduction(value), CommunityIntroductionValidationError);
  }
});

test("text and URL limits are enforced at the public boundary", () => {
  for (const [field, limit] of Object.entries({ summary: 160, introduction: 3000, activities: 600, activityHours: 160, joiningInfo: 1000 })) {
    assert.equal((validateCommunityIntroduction({ ...profile(), [field]: "가".repeat(limit) }) as Record<string, unknown>)[field], "가".repeat(limit));
    assert.throws(() => validateCommunityIntroduction({ ...profile(), [field]: "가".repeat(limit + 1) }), CommunityIntroductionValidationError);
  }
  for (const value of ["javascript:alert(1)", "data:image/png;base64,AA==", "http://example.com", "https://user:secret@example.com", "https://example.com/has space", "x".repeat(501),
    "https://127.0.0.1/image.png", "https://2130706433", "https://0x7f000001", "https://[::1]", "https://localhost", "https://site.local", "https://site.internal",
    "https://site.localhost.", "https://example.com:444/image.png", "https://intranet"]) {
    assert.throws(() => validateCommunityIntroduction({ ...profile(), contactUrl: value }), CommunityIntroductionValidationError);
    assert.throws(() => validateCommunityIntroduction({ ...profile(), bannerUrl: value }), CommunityIntroductionValidationError);
  }
  assert.equal(validateCommunityIntroduction({ ...profile(), contactUrl: "" }).contactUrl, null);
});

test("public DTO strictly allowlists version, canonical identity, profile and date", () => {
  const dto = toPublicCommunityIntroductionDto(snapshot(), "https://community.example")!;
  assert.deepEqual(Object.keys(dto).sort(), ["origin", "profile", "updatedAt", "version"]);
  assert.deepEqual(Object.keys(dto.profile).sort(), ["activities", "activityHours", "bannerUrl", "contactUrl", "introduction", "joiningInfo", "summary"]);
  assert.deepEqual(parsePublicCommunityIntroductionDto(dto, dto.origin), dto);
  for (const value of [
    { ...dto, version: 2 }, { ...dto, origin: "https://community.example/" }, { ...dto, origin: "https://user:secret@community.example" },
    { ...dto, revision: 3 }, { ...dto, updatedByUserAccountId: "private" }, { ...dto, updatedAt: "yesterday" },
    { ...dto, updatedAt: "2026-10-29" }, { ...dto, profile: { ...dto.profile, published: true } },
    { ...dto, profile: { ...dto.profile, internalMaintenanceNote: "private" } },
  ]) assert.throws(() => parsePublicCommunityIntroductionDto(value), CommunityIntroductionValidationError);
  assert.throws(() => parsePublicCommunityIntroductionDto(dto, "https://other.example"), CommunityIntroductionValidationError);
});

test("unpublished managed-site guard does not whitelist the introduction API", () => {
  assert.equal(isPublicCommunityPreviewRequest("/api/community-introduction", "GET"), false);
  assert.equal(isPublicCommunityPreviewRequest("/api/admin/community-introduction", "PUT"), false);
});

test("introduction HTTP boundaries use ADMIN mutation protection and configured origin", () => {
  const admin = readFileSync(new URL("../src/app/api/admin/community-introduction/route.ts", import.meta.url), "utf8");
  assert.equal((admin.match(/requireOperationsApiSession\("ADMIN"\)/gu) ?? []).length, 2);
  assert.match(admin, /prepareOperationsMutation\(request/);
  assert.match(admin, /validateCommunityIntroduction/);
  assert.match(admin, /formatRevisionEtag/);
  const publicRoute = readFileSync(new URL("../src/app/api/community-introduction/route.ts", import.meta.url), "utf8");
  assert.match(publicRoute, /SERVICE_BRAND.id === "hub"/);
  assert.match(publicRoute, /toPublicCommunityIntroductionDto/);
  assert.match(publicRoute, /getServiceOrigin\(\).origin/);
  assert.doesNotMatch(publicRoute, /headers.get\(["'](?:host|x-forwarded-host)|internalMaintenanceNote|updatedByUserAccountId/iu);
});
