import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("public MMR page exposes canonical allowlisted filters and bounded projection summaries", () => {
  const page = source("../src/app/(public)/(statistics)/rankings/mmr/page.tsx");
  for (const contract of [
    "parseMmrPlayerQuery",
    "loadRuntimeMmr",
    'alternates: { canonical: "/rankings/mmr" }',
    'name="q"',
    'name="position"',
    "pendingSourceCount",
    "confidence",
    "sampleSize",
    'role="status"',
  ]) assert.equal(page.includes(contract), true, contract);
  assert.equal(page.includes("reasonCode"), false);
  assert.equal(page.includes("actorUserAccountId"), false);
});

test("admin MMR workspace connects protected recalculate, adjustment, players and review states", () => {
  const page = source("../src/app/(admin)/admin/balance-ai/page.tsx");
  const actions = source("../src/app/(admin)/admin/balance-ai/mmr-admin-actions.tsx");
  for (const contract of ["requirePageRole", 'tab === "players"', 'tab === "reviews"', 'raw.action === "recalculate"', "selectedReviewId", "pendingSourceCount", "MmrAdminActions", "?tab=balance"]) {
    assert.equal(page.includes(contract), true, contract);
  }
  for (const contract of [
    'fetch(`/api/admin/balance-ai/${path}`',
    '"If-Match"',
    '"Idempotency-Key"',
    "SUPER_ADMIN",
    "전체 원장 재계산",
    'role="alertdialog"',
    'aria-modal="true"',
    "확인 후 재계산",
    "조정 원장 추가",
    'aria-live="polite"',
  ]) assert.equal(actions.includes(contract), true, contract);
});

test("team balance provider selects READY MMR before statistics fallback", () => {
  const provider = source("../src/modules/team-tools/infrastructure/postgres-team-balance-rating-provider.ts");
  assert.equal(provider.includes("mmrProjectionStates"), true);
  assert.equal(provider.includes("toTeamBalanceMmrProviderDto"), true);
  assert.equal(provider.includes("loadStatisticsFallback"), true);
});
