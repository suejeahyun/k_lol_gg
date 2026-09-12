import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("역할 변경 API는 same-origin 세션 검사 뒤 일반 ADMIN을 mutation parsing 전에 거부한다", async () => {
  const source = await readFile(
    new URL("../src/modules/accounts/infrastructure/admin-account-route-handlers.ts", import.meta.url),
    "utf8",
  );
  const context = source.slice(
    source.indexOf("async function mutationContext"),
    source.indexOf("async function bodyOrProblem"),
  );
  const authorizationIndex = context.indexOf("authorizeAdminAccountApi(request)");
  const originIndex = context.indexOf("guardAccountMutationOrigin(request");
  const superGuardIndex = context.indexOf('authorization.session.role !== "SUPER_ADMIN"');
  const revisionIndex = context.indexOf("readIfMatchRevision(request.headers)");

  assert.ok(authorizationIndex >= 0);
  assert.ok(originIndex > authorizationIndex);
  assert.ok(superGuardIndex > originIndex);
  assert.ok(revisionIndex > superGuardIndex);

  const roleHandler = source.slice(
    source.indexOf("export async function handleAdminRoleMutation"),
    source.indexOf("async function internalReasonMutationContext"),
  );
  assert.match(roleHandler, /mutationContext\(request, userAccountId, true\)/);
  assert.ok(roleHandler.indexOf("bodyOrProblem(request") > roleHandler.indexOf("mutationContext(request"));
  assert.ok(roleHandler.indexOf("buildAccountMutationCommand") > roleHandler.indexOf("bodyOrProblem(request"));
});

test("역할 관리 UI와 목록 진입점은 SUPER_ADMIN에게만 노출된다", async () => {
  const actions = await readFile(
    new URL("../src/components/admin/accounts/admin-account-actions.tsx", import.meta.url),
    "utf8",
  );
  const listPage = await readFile(
    new URL("../src/app/(admin)/admin/users/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(actions, /actor\.role === "SUPER_ADMIN" \? <form id="role-management"/);
  assert.match(actions, /관리자 지정 요건은 승인됨\(APPROVED\)이고 삭제되지 않은 일반 사용자\(USER\) 계정/);
  assert.match(actions, /플레이어 연결 여부는 요건이 아닙니다/);
  assert.match(actions, /관리자 지정은 승인된 계정만 가능합니다/);
  assert.match(actions, /roleManagementAllowed/);

  assert.match(listPage, /viewerRole === "SUPER_ADMIN" \? <th>역할 관리<\/th>/);
  assert.match(listPage, /href=\{`\/admin\/users\/\$\{account\.id\}#role-management`\}/);
  assert.match(listPage, /account\.role === "USER" \? "관리자 지정" : "역할 관리"/);
  assert.match(listPage, /S01 · 계정 운영/);
  assert.doesNotMatch(listPage, /ACCOUNT OPERATIONS|revision 기반/);
});

test("승인된 미삭제 USER의 ADMIN 승격은 플레이어 연결을 요구하지 않는다", async () => {
  const repository = await readFile(
    new URL("../src/modules/accounts/infrastructure/postgres-account-repository.ts", import.meta.url),
    "utf8",
  );
  const roleMutation = repository.slice(
    repository.indexOf("async changeRole("),
    repository.indexOf("async resetPassword("),
  );

  assert.match(roleMutation, /nextRole === "ADMIN" && target\.status !== "APPROVED"/);
  assert.doesNotMatch(roleMutation, /\.from\(players\)/);
  assert.match(roleMutation, /target\.id === actor\.id \|\| target\.role === "SUPER_ADMIN"/);
  assert.match(roleMutation, /target\.deletedAt/);
});
