import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("champion administrator pages reuse the highlight content shell and keep safe mutations", async () => {
  const [list, create, edit, form, mediaPages, highlightPage, galleryPage] = await Promise.all([
    source("src/app/(admin)/admin/champions/page.tsx"),
    source("src/app/(admin)/admin/champions/new/page.tsx"),
    source("src/app/(admin)/admin/champions/[championId]/edit/page.tsx"),
    source("src/app/(admin)/admin/champions/champion-form.tsx"),
    source("src/components/admin/media/admin-media-pages.tsx"),
    source("src/app/(admin)/admin/highlights/page.tsx"),
    source("src/app/(admin)/admin/images/page.tsx"),
  ]);
  assert.match(list, /loadRuntimeChampions/);
  assert.match(list, /ready|state/);
  assert.match(create, /ChampionForm/);
  assert.match(edit, /notFound/);
  assert.match(form, /Idempotency-Key/);
  assert.match(form, /If-Match/);
  assert.match(form, /method: "DELETE"/);
  assert.match(list, /AdminContentTabs active="champion"/);
  assert.match(create, /AdminContentTabs active="champion"/);
  assert.match(edit, /AdminContentTabs active="champion"/);
  assert.match(list, /admin-media\.module\.css/);
  assert.match(form, /admin-media\.module\.css/);
  assert.match(mediaPages, /export function AdminContentTabs/);
  assert.match(mediaPages, /aria-current=/);
  assert.match(highlightPage, /AdminMediaListPage kind="highlight"/);
  assert.match(galleryPage, /AdminMediaListPage kind="gallery"/);
  assert.doesNotMatch(list, /AdminWorkspacePage/);
  assert.doesNotMatch(list, /champions\.module\.css/);
});

test("champion read APIs keep public and administrator namespaces separated", async () => {
  const [publicList, publicDetail, adminList, adminDetail] = await Promise.all([
    source("src/app/api/champions/route.ts"),
    source("src/app/api/champions/[championId]/route.ts"),
    source("src/app/api/admin/champions/route.ts"),
    source("src/app/api/admin/champions/[championId]/route.ts"),
  ]);
  assert.doesNotMatch(publicList, /authorizeApiRole/);
  assert.doesNotMatch(publicDetail, /authorizeApiRole/);
  assert.match(adminList, /authorizeApiRole\("ADMIN"\)/);
  assert.match(adminDetail, /authorizeApiRole\("ADMIN"\)/);
  assert.match(adminDetail, /ETag/);
  assert.match(adminList, /export async function POST/);
  assert.match(adminDetail, /export function PATCH/);
  assert.match(adminDetail, /export function DELETE/);
});
