import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("public destruction detail keeps owner application, vote and explicit unavailable/error states", () => {
  const page = source("../src/app/(public)/(competitions)/competitions/destruction/[tournamentId]/page.tsx");
  const actions = source("../src/app/(public)/(competitions)/competitions/destruction/[tournamentId]/destruction-owner-actions.tsx");
  assert.match(page, /role="status"/);
  assert.match(page, /role="alert"/);
  assert.match(page, /notFound\(\)/);
  assert.match(page, /tournamentFixtures/);
  assert.match(page, /mvpResults/);
  assert.match(page, /rosterPlayers/);
  assert.match(page, /teamAName/);
  assert.match(page, /championTeamName/);
  assert.match(actions, /UPSERT|application/);
  assert.match(actions, /mvp-vote/);
  assert.match(actions, /aria-live="polite"/);
  assert.match(actions, /If-Match/);
  assert.match(actions, /Idempotency-Key/);
});

test("administrator destruction workspaces expose the full staged lifecycle", () => {
  const list = source("../src/app/(admin)/admin/progress/destruction/page.tsx");
  const create = source("../src/app/(admin)/admin/progress/destruction/new/destruction-create-form.tsx");
  const detail = source("../src/app/(admin)/admin/progress/destruction/[tournamentId]/page.tsx");
  const actions = source("../src/app/(admin)/admin/progress/destruction/[tournamentId]/destruction-admin-actions.tsx");
  assert.match(list, /result\.state === "ready"/);
  assert.match(list, /role=\{result\.state === "error"/);
  assert.match(create, /preliminaryRoundCount/);
  assert.match(create, /laneLimits/);
  assert.match(detail, /requirePageRole\("ADMIN"/);
  for (const command of ["START_RECRUITMENT", "CLOSE_RECRUITMENT", "CONFIRM_TEAMS", "START_AUCTION", "DRAW_AUCTION", "HOLD_AUCTION", "SELL_AUCTION", "PUBLISH_PRELIMINARY", "RECORD_PRELIMINARY_RESULT", "CORRECT_PRELIMINARY_RESULT", "PUBLISH_TOURNAMENT", "RECORD_TOURNAMENT_RESULT", "CORRECT_TOURNAMENT_RESULT", "REPLACE_PARTICIPANT", "RESET_MVP", "ASSIGN_MVP", "COMPLETE_DESTRUCTION", "CANCEL_DESTRUCTION", "RESTORE_DESTRUCTION"]) assert.match(actions, new RegExp(command));
  for (const token of ["BoundedPicker", "playerOptions", "playerLabels", "ResultForms", "captainParticipantId", "winnerTeamId"]) assert.match(actions, new RegExp(token));
  assert.doesNotMatch(`${detail}${actions}`, /신청 UUID|주장 JSON|참가자 UUID|팀 UUID|경기 ID|플레이어 UUID/u);
  assert.match(actions, /SUPER/);
  assert.match(actions, /aria-live="polite"/);
});

test("API source keeps account owner and ADMIN boundaries separate", () => {
  const owner = source("../src/app/api/competitions/destruction/[tournamentId]/application/route.ts");
  const vote = source("../src/app/api/competitions/destruction/[tournamentId]/mvp-vote/route.ts");
  const admin = source("../src/app/api/admin/competitions/destruction/[tournamentId]/route.ts");
  assert.match(owner, /requireDestructionApiSession\("USER"\)/);
  assert.match(owner, /getOwnedPlayerId/);
  assert.match(vote, /castOwnMvpVote/);
  assert.match(admin, /requireDestructionApiSession\("ADMIN"\)/);
  assert.match(admin, /prepareDestructionMutation/);
});
