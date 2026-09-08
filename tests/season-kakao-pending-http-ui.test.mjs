import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFile(resolve(root, path), "utf8");

test("Kakao pending API splits ADMIN reads from SUPER TOTP mutations", async () => {
  const [list, detail, resolveRoute, cancelRoute, repository] = await Promise.all([
    read("src/app/api/admin/season-kakao-pending/route.ts"),
    read("src/app/api/admin/season-kakao-pending/[pendingId]/route.ts"),
    read("src/app/api/admin/season-kakao-pending/[pendingId]/resolve/route.ts"),
    read("src/app/api/admin/season-kakao-pending/[pendingId]/cancel/route.ts"),
    read("src/modules/seasons/infrastructure/postgres-season-repository.ts"),
  ]);
  assert.match(list, /requireSeasonApiSession\("ADMIN"\)/);
  assert.match(detail, /requireSeasonApiSession\("ADMIN"\)/);
  assert.match(resolveRoute, /requireSeasonApiSession\("SUPER_ADMIN"\)/);
  assert.match(cancelRoute, /requireSeasonApiSession\("SUPER_ADMIN"\)/);
  for (const contract of ["SUPER_ADMIN_MUTATION_SESSION_POLICY", "seasonCommandReceipts", "pendingAuditSnapshot", "SEASON_KAKAO_PENDING_RESOLVED", "SEASON_KAKAO_PENDING_CANCELLED"]) assert.match(repository, new RegExp(contract));
});

test("pending operator UI uses bounded filters, a player picker and revision-safe commands", async () => {
  const [listPage, detailPage, actions] = await Promise.all([
    read("src/app/(admin)/admin/seasons/kakao-pending/page.tsx"),
    read("src/app/(admin)/admin/seasons/kakao-pending/[pendingId]/page.tsx"),
    read("src/app/(admin)/admin/seasons/kakao-pending/pending-actions.tsx"),
  ]);
  for (const filter of ["seasonId", "applyDate", "recruitNo", "matchState", "status"]) assert.match(listPage, new RegExp(filter));
  assert.match(detailPage, /candidates/);
  assert.match(actions, /name="playerId"/);
  assert.match(actions, /"If-Match"/);
  assert.match(actions, /"Idempotency-Key"/);
  assert.match(actions, /canMutate/);
});

test("public season applications expose Kakao-started recruit rounds without leaking pending identities", async () => {
  const [page, actions, repository] = await Promise.all([
    read("src/app/(public)/(applications)/applications/page.tsx"),
    read("src/app/(public)/(applications)/applications/application-actions.tsx"),
    read("src/modules/seasons/infrastructure/postgres-season-repository.ts"),
  ]);
  assert.match(page, /availableRecruitNos/);
  assert.match(page, /recruitNo: recruitNoValues/);
  assert.match(actions, /\{ recruitNo, mainPosition, subPositions \}/);
  assert.match(repository, /assertRecruitRoundExists/);
  assert.doesNotMatch(page, /suppliedName|suppliedRiotId|sourceReferenceHash/);
});
