import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  ADMIN_WORKSPACES,
  isAdminWorkspaceActive,
} from "../src/modules/admin/domain/admin-workspaces";

test("administrator IA exposes exactly ten unique protected workspaces", () => {
  assert.equal(ADMIN_WORKSPACES.length, 10);
  assert.equal(new Set(ADMIN_WORKSPACES.map(({ id }) => id)).size, 10);
  assert.equal(new Set(ADMIN_WORKSPACES.map(({ href }) => href)).size, 10);
  assert.equal(ADMIN_WORKSPACES[0].href, "/admin");

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
  assert.equal(isAdminWorkspaceActive("/admin/highlights/example/edit", "/admin/champions"), true);
  assert.equal(isAdminWorkspaceActive("/admin/images", "/admin/champions"), true);
});

test("dashboard leaves a real work destination available", () => {
  const firstWorkDestination = ADMIN_WORKSPACES.find(({ id }) => id !== "home");
  assert.equal(firstWorkDestination?.href, "/admin/players");
});
