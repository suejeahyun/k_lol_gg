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
  assert.match(list, /loadRuntimeTeamBalanceRecommendations/);
  assert.match(detail, /requirePageRole\("ADMIN"/);
  assert.match(detail, /authorization:\s*"ADMIN"/);
  assert.match(detail, /TeamBalanceDraftWorkspace/);
  assert.match(detail, /TeamBalanceRecommendationsPanel/);
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

test("administrator drafts support recoverable archive and persisted match registration", async () => {
  const [workspace, archiveRoute, restoreRoute, newMatch, editor, matchService, matchRepository] = await Promise.all([
    source("../src/app/(public)/(tools)/tools/team-balance/drafts/[draftId]/team-balance-draft-workspace.tsx"),
    source("../src/app/api/admin/team-tools/drafts/[draftId]/archive/route.ts"),
    source("../src/app/api/admin/team-tools/drafts/[draftId]/restore/route.ts"),
    source("../src/app/(admin)/admin/matches/new/page.tsx"),
    source("../src/app/(admin)/admin/matches/match-editor.tsx"),
    source("../src/modules/matches/application/match-service.ts"),
    source("../src/modules/matches/infrastructure/postgres-match-repository.ts"),
  ]);
  assert.match(workspace, /mode === "ADMIN"[\s\S]*선택 팀으로 경기 등록/);
  assert.match(workspace, /초안 보관/);
  assert.match(workspace, /초안 복구/);
  assert.match(archiveRoute, /service\.archiveDraft/);
  assert.match(restoreRoute, /service\.restoreDraft/);
  assert.match(newMatch, /teamBalanceDraftId/);
  assert.match(newMatch, /selectedCandidate\.assignments\.map/);
  assert.match(newMatch, /getAdminEditorCatalog\([\s\S]*draftResult\.data\?\.participants/);
  assert.match(editor, /teamBalanceSource \? \{ \.\.\.record, \.\.\.teamBalanceSource \}/);
  assert.match(matchService, /parseAdminCreateRecord/);
  assert.match(matchRepository, /assertAdminTeamBalanceSource/);
  assert.match(matchRepository, /teamBalanceDraftId: draft\.id/);
});
