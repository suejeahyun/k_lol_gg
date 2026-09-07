import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("MMR 수동 조정은 raw UUID 대신 bounded 플레이어 선택기를 사용한다", () => {
  const mmr = source("../src/app/(admin)/admin/balance-ai/mmr-admin-actions.tsx");
  assert.equal(mmr.includes("<BoundedPicker"), true);
  assert.equal(mmr.includes('remoteEndpoint="/api/admin/matches/editor-options/players"'), true);
  assert.equal(mmr.includes("플레이어 UUID<input"), false);
  assert.equal(mmr.includes("busy || !playerId"), true);
});

test("Riot 작업은 현재 목록에서 플레이어와 link를 선택하고 revision을 자동 계산한다", () => {
  const riot = source("../src/components/riot/riot-admin-actions.tsx");
  assert.equal(riot.includes("<BoundedPicker"), true);
  assert.equal(riot.includes("selectedPlayer?.revision ?? 0"), true);
  assert.equal(riot.includes('type="checkbox"'), true);
  assert.equal(riot.includes("[...selectedLinkIds].sort()"), true);
  assert.equal(riot.includes("플레이어 UUID<input"), false);
  assert.equal(riot.includes("일괄 link UUID<input"), false);
  assert.equal(riot.includes("현재 revision<input"), false);
});

test("징계 대상 선택은 관리자 전용 bounded endpoint의 allowlist metadata로 표시값을 채운다", () => {
  const form = source("../src/components/discipline/admin-discipline-create-form.tsx");
  const endpoint = source("../src/app/api/admin/discipline-records/target-options/route.ts");
  assert.equal(form.includes('remoteEndpoint="/api/admin/discipline-records/target-options"'), true);
  for (const field of ["playerId", "accountId", "targetName", "nickname", "tagLine"]) assert.equal(form.includes(`metadata?.${field}`), true, field);
  assert.equal(endpoint.includes('requireDisciplineApiSession("ADMIN")'), true);
  assert.equal(endpoint.includes(".slice(0, 20)"), true);
  assert.equal(endpoint.includes("password"), false);
});

test("공통 bounded picker는 원격 metadata를 문자열 allowlist로 제한한다", () => {
  const picker = source("../src/app/(admin)/admin/matches/bounded-picker.tsx");
  assert.equal(picker.includes("Object.keys(rawMetadata).length <= 10"), true);
  assert.equal(picker.includes("entry.length <= 200"), true);
});
