import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  ADMIN_WORKSPACES,
  ADMIN_OPERATION_FORM_LINKS,
  getAdminOperationFormType,
  isAdminWorkspaceActive,
} from "../src/modules/admin/domain/admin-workspaces";

test("administrator IA exposes exactly ten unique protected workspaces", () => {
  assert.equal(ADMIN_WORKSPACES.length, 10);
  assert.equal(new Set(ADMIN_WORKSPACES.map(({ id }) => id)).size, 10);
  assert.equal(new Set(ADMIN_WORKSPACES.map(({ href }) => href)).size, 10);
  assert.equal(ADMIN_WORKSPACES[0].href, "/admin");
  assert.equal(ADMIN_WORKSPACES.find(({ id }) => id === "content")?.href, "/admin/highlights");

  for (const workspace of ADMIN_WORKSPACES) {
    assert.match(workspace.href, /^\/admin(?:\/|$)/);
    assert.ok(workspace.label.length > 0);
    assert.ok(workspace.description.length > 0);
  }
});

test("every administrator workspace has a canonical App Router page", () => {
  for (const workspace of ADMIN_WORKSPACES) {
    const pageUrl = new URL(`../src/app/(admin)${workspace.href}/page.tsx`, import.meta.url);
    assert.equal(existsSync(fileURLToPath(pageUrl)), true, `${workspace.href} page is missing`);
  }
});

test("active workspace matching does not make the dashboard match every route", () => {
  assert.equal(isAdminWorkspaceActive("/admin", "/admin"), true);
  assert.equal(isAdminWorkspaceActive("/admin/players", "/admin"), false);
  assert.equal(isAdminWorkspaceActive("/admin/players/example", "/admin/players"), true);
  assert.equal(isAdminWorkspaceActive("/admin/progress/destruction", "/admin/progress/event"), true);
  assert.equal(isAdminWorkspaceActive("/admin/highlights/example/edit", "/admin/highlights"), true);
  assert.equal(isAdminWorkspaceActive("/admin/images", "/admin/highlights"), true);
  assert.equal(isAdminWorkspaceActive("/admin/champions/example/edit", "/admin/highlights"), true);
});

test("dashboard leaves a real work destination available", () => {
  const firstWorkDestination = ADMIN_WORKSPACES.find(({ id }) => id !== "home");
  assert.equal(firstWorkDestination?.href, "/admin/players");
});

test("operations exposes all four existing form routes and selects their lists and details consistently", () => {
  assert.deepEqual(ADMIN_OPERATION_FORM_LINKS.map(({ formType, label }) => ({ formType, label })), [
    { formType: "meetups", label: "모임" },
    { formType: "leaves", label: "외출" },
    { formType: "suggestions", label: "건의사항" },
    { formType: "friends", label: "디스코드 초대" },
  ]);
  for (const link of ADMIN_OPERATION_FORM_LINKS) {
    const url = new URL(link.href, "https://example.invalid");
    assert.equal(url.pathname, "/admin/operation-forms");
    assert.equal(getAdminOperationFormType(url.pathname, url.searchParams.get("type")), link.formType);
    for (const pathname of [url.pathname, `${url.pathname}/${link.formType}`, `${url.pathname}/${link.formType}/record-id`]) {
      assert.equal(isAdminWorkspaceActive(pathname, "/admin/discipline"), true);
      assert.equal(isAdminWorkspaceActive(pathname, "/admin/kakao"), false);
      assert.equal(ADMIN_WORKSPACES.filter((workspace) => isAdminWorkspaceActive(pathname, workspace.href)).length, 1);
    }
    assert.equal(getAdminOperationFormType(`${url.pathname}/${link.formType}/record-id`, "unknown"), link.formType);
  }
  assert.equal(getAdminOperationFormType("/admin/operation-forms", null), null);
  assert.equal(getAdminOperationFormType("/admin/operation-forms", "unknown"), null);
  assert.equal(getAdminOperationFormType("/admin/operation-forms/not-a-type", "friends"), null);
  assert.equal(getAdminOperationFormType("/admin/kakao", "friends"), null);
  assert.equal(isAdminWorkspaceActive("/admin/operation-forms-other", "/admin/discipline"), false);
});
