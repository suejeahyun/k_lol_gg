import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("administrator team draft pages use the ADMIN viewer and administrator mutation boundary", async () => {
  const [list, detail] = await Promise.all([
    source("../src/app/(admin)/admin/balance/drafts/page.tsx"),
    source("../src/app/(admin)/admin/balance/drafts/[draftId]/page.tsx"),
  ]);
  assert.match(list, /requirePageRole\("ADMIN"/);
  assert.match(list, /authorization:\s*"ADMIN"/);
  assert.match(detail, /requirePageRole\("ADMIN"/);
  assert.match(detail, /authorization:\s*"ADMIN"/);
  assert.match(detail, /TeamBalanceDraftWorkspace/);
  assert.match(detail, /\/api\/admin\/team-tools\/drafts/);
  assert.doesNotMatch(detail, /READ ONLY/);
});

test("administrator recommendation aliases remain same-origin permanent redirects", async () => {
  const [detailAlias, listAlias] = await Promise.all([
    source("../src/app/(admin)/admin/balance/drafts/[draftId]/recommendations/route.ts"),
    source("../src/app/(admin)/admin/balance/recommendations/route.ts"),
  ]);
  assert.match(detailAlias, /new URL\(`\/admin\/balance\/drafts\/\$\{encodeURIComponent\(draftId\)\}`/);
  assert.match(detailAlias, /"tab",\s*"recommendations"/);
  assert.match(listAlias, /new URL\("\/admin\/balance\/drafts",\s*source\)/);
  assert.match(listAlias, /"view",\s*"recommendations"/);
  assert.match(detailAlias, /308/);
  assert.match(listAlias, /308/);
});
