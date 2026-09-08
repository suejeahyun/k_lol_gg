import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(
  new URL("../src/app/(public)/(matches)/matches/submit/page.tsx", import.meta.url),
  "utf8",
);
const formSource = readFileSync(
  new URL("../src/app/(public)/(matches)/matches/submit/submission-form.tsx", import.meta.url),
  "utf8",
);
const ownerDraftPageSource = readFileSync(
  new URL("../src/app/(public)/(tools)/tools/team-balance/drafts/[draftId]/page.tsx", import.meta.url),
  "utf8",
);
const adminDraftPageSource = readFileSync(
  new URL("../src/app/(admin)/admin/balance/drafts/[draftId]/page.tsx", import.meta.url),
  "utf8",
);

test("match submission accepts only an owner-verified selected team-balance draft", () => {
  assert.match(pageSource, /parseMatchSubmitPageQuery/);
  assert.match(pageSource, /loadRuntimeTeamBalance\(\(teamBalanceService\) => teamBalanceService\.getDraft/);
  assert.match(pageSource, /authorization: "OWNER"/);
  assert.match(pageSource, /draftResult\.data\.selectedCandidateSignature/);
  assert.match(pageSource, /draftResult\.data\.status !== "ARCHIVED"/);
  assert.match(formSource, /requestedTeamBalanceDraftId && !teamBalanceDraft/);
  assert.match(formSource, /teamBalanceDraftId: teamBalanceDraft\?\.id \?\? null/);
  assert.match(formSource, /teamBalanceDraftId=\$\{encodeURIComponent\(requestedTeamBalanceDraftId\)\}/);
});

test("successful server selection remounts both draft workspaces without resetting local edits", () => {
  const serverSelectionKey = /key=\{`\$\{result\.data\.evaluationRound\}:\$\{result\.data\.selectedCandidateSignature \?\? "none"\}`\}/;
  assert.match(ownerDraftPageSource, serverSelectionKey);
  assert.match(adminDraftPageSource, serverSelectionKey);
});
