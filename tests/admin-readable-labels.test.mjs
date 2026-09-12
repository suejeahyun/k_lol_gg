import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("season administration presents lifecycle, status, source, and position labels in Korean", async () => {
  const page = await source("src/app/(admin)/admin/seasons/page.tsx");
  for (const token of [
    "seasonStatusLabel[season.status]",
    "applicationStatusLabel[application.status]",
    "applicationSourceLabel[application.source]",
    "positionLabel[application.mainPosition]",
    "변경 버전 {season.revision}",
  ]) assert.equal(page.includes(token), true, token);
  assert.doesNotMatch(page, />CREATE<|>LIFECYCLE<|>REVIEW QUEUE<|>ADMIN \/ SUPER<|revision \{season\.revision\}| · rev \{application\.revision\}/);
});

test("account and settings administration avoid decorative English labels", async () => {
  const [list, detail, settings, shell] = await Promise.all([
    source("src/app/(admin)/admin/users/page.tsx"),
    source("src/app/(admin)/admin/users/[userAccountId]/page.tsx"),
    source("src/app/(admin)/admin/site-settings/settings-form.tsx"),
    source("src/components/admin/admin-shell.tsx"),
  ]);
  assert.match(list, /S01 · 계정 운영/);
  assert.match(detail, /> 사용자 계정</);
  assert.match(detail, />변경 버전</);
  assert.match(settings, /변경 버전 \{settings\.revision\}/);
  for (const label of ["운영", "미리보기", "테스트", "로컬"]) assert.match(shell, new RegExp(`return "${label}"`));
  assert.doesNotMatch(`${list}\n${detail}\n${settings}`, /ACCOUNT OPERATIONS|USER ACCOUNT|>revision<|revision 기반|>SUPER가|claim이 없습니다/);
});
