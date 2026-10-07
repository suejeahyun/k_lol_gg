import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import ts from "typescript";

import { validTeamBalanceSubmissionAssignments } from "../src/modules/matches/infrastructure/postgres-match-repository";
import type { LinkedReviewTeam } from "../src/app/(admin)/admin/matches/submissions/[submissionId]/submission-review";
import { SUBMISSION_STATUS_LABEL } from "../src/app/(admin)/admin/matches/submission-labels";

const positions = ["TOP", "JGL", "MID", "ADC", "SUP"];
const players = Array.from({ length: 10 }, (_, index) => ({ id: `${String(index + 1).padStart(8, "0")}-0000-4000-8000-000000000000`, nickname: `합성${index}`, tagLine: "QA", status: "ACTIVE" }));
const assignments = players.map(({ id }, index) => ({ playerId: id, team: index < 5 ? "BLUE" : "RED", position: positions[index % 5], rating: { source: "DEFAULT", rawScore: 50 } }));
const submission = { id: "synthetic-submission", ownerUserAccountId: "synthetic-owner", teamBalanceDraftId: "synthetic-team", status: "PENDING_REVIEW", reviewedResult: null, publicCode: "MR2SYNTHETIC", title: "합성", organizer: "합성", seriesNumber: 1, playedOn: "2026-10-07", seasonName: "합성 시즌" };
const draft = { id: "synthetic-team", ownerUserAccountId: "synthetic-owner", title: "현재 저장 팀", revision: 7, status: "SAVED", selectedCandidateSource: "MANUAL", selectedCandidateSignature: "synthetic-signature", evaluationRound: 2, participants: players.map(({ id }) => ({ playerId: id })), candidates: [{ signature: "synthetic-signature", source: "MANUAL", evaluationRound: 2, assignments }] };
function Review() { return null; }
function findReview(node: React.ReactNode): React.ReactElement<{ linkedTeam: LinkedReviewTeam | null; catalog: { players: typeof players } }> | null {
  if (!React.isValidElement<{ children?: React.ReactNode }>(node)) return null;
  if (node.type === Review) return node as ReturnType<typeof findReview>;
  for (const child of React.Children.toArray(node.props.children)) { const found = findReview(child); if (found) return found; }
  return null;
}
async function render({ currentSubmission = submission, currentDraft = draft, currentPlayers = players, teamState = "ready", unauthorized = false }: {
  currentSubmission?: object; currentDraft?: typeof draft; currentPlayers?: typeof players; teamState?: string; unauthorized?: boolean;
} = {}) {
  const calls: Array<{ kind: string; args: unknown[] }> = [];
  const loaded = { exports: {} as { default: (props: { params: Promise<{ submissionId: string }> }) => Promise<React.ReactNode> } };
  const compiled = ts.transpileModule(readFileSync(new URL("../src/app/(admin)/admin/matches/submissions/[submissionId]/page.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  vm.runInNewContext(compiled, { exports: loaded.exports, require(specifier: string) {
    if (specifier === "react/jsx-runtime") return jsx;
    if (specifier === "next/link") return () => null;
    if (specifier === "next/navigation") return { notFound() { throw new Error("NOT_FOUND"); } };
    if (specifier.endsWith("/theme-icons")) return { ArrowLeft: () => null };
    if (specifier.endsWith("/server-authorization")) return { requirePageRole: async (...args: unknown[]) => { calls.push({ kind: "auth", args }); if (unauthorized) throw new Error("AUTH_REQUIRED"); return { userId: "synthetic-admin" }; } };
    if (specifier.endsWith("/runtime-match-data")) return { loadRuntimeMatchData: async (read: (service: object) => Promise<unknown>) => ({ state: "ready", data: await read({ getAdminSubmission: async (...args: unknown[]) => { calls.push({ kind: "submission", args }); return currentSubmission; }, getAdminEditorCatalog: async (...args: unknown[]) => { calls.push({ kind: "catalog", args }); return { players: currentPlayers, champions: [], seasons: [] }; } }) }) };
    if (specifier.endsWith("/runtime-team-balance")) return { loadRuntimeTeamBalance: async (read: (service: object) => Promise<unknown>) => teamState === "ready" ? { state: "ready", data: await read({ getDraft: async (...args: unknown[]) => { calls.push({ kind: "draft", args }); return currentDraft; } }) } : { state: teamState } };
    if (specifier.endsWith("/postgres-match-repository")) return { validTeamBalanceSubmissionAssignments };
    if (specifier === "./submission-review") return { SubmissionReview: Review };
    if (specifier === "../../submission-labels") return { SUBMISSION_STATUS_LABEL };
    if (specifier.endsWith(".module.css")) return { __esModule: true, default: {} };
    throw new Error(`unexpected linked-team dependency: ${specifier}`);
  } });
  try { return { calls, review: findReview(await loaded.exports.default({ params: Promise.resolve({ submissionId: submission.id }) })), error: null }; }
  catch (error) { return { calls, review: null, error }; }
}

test("linked review reads current selected layout with ADMIN authorization and includes all ten players in the existing catalog", async () => {
  const result = await render();
  assert.equal(result.error, null);
  assert.equal(result.calls[0].kind, "auth");
  assert.deepEqual(result.calls[0].args, ["ADMIN", `/admin/matches/submissions/${submission.id}`]);
  assert.equal(JSON.stringify(result.calls.find((call) => call.kind === "draft")?.args), JSON.stringify([{ actorUserAccountId: "synthetic-admin", authorization: "ADMIN" }, draft.id]));
  assert.deepEqual([...result.calls.find((call) => call.kind === "catalog")!.args[0] as string[]], players.map((player) => player.id));
  const linked = result.review?.props.linkedTeam;
  assert.ok(linked); assert.equal(linked.revision, 7); assert.equal(linked.assignments.length, 10);
  assert.deepEqual(Object.keys(linked.assignments[0]).sort(), ["playerId", "position", "team"]);
});

test("the optional team read never replaces a saved review or runs for terminal and unrelated submissions", async () => {
  for (const patch of [{ teamBalanceDraftId: null }, { status: "APPROVED" }, { reviewedResult: { games: [] } }]) {
    const result = await render({ currentSubmission: { ...submission, ...patch } });
    assert.equal(result.calls.some((call) => call.kind === "draft"), false);
    assert.equal(result.review?.props.linkedTeam, null);
  }
});

test("archived, mismatched and invalid current layouts do not offer a roster import", async () => {
  const invalids = [
    { ...draft, status: "ARCHIVED" }, { ...draft, ownerUserAccountId: "other-owner" },
    { ...draft, selectedCandidateSignature: null }, { ...draft, selectedCandidateSource: "AUTO" }, { ...draft, evaluationRound: 3 },
    { ...draft, candidates: [{ ...draft.candidates[0], assignments: assignments.slice(0, 9) }] },
    { ...draft, candidates: [{ ...draft.candidates[0], assignments: assignments.map((row, index) => index === 1 ? { ...row, position: "TOP" } : row) }] },
  ];
  for (const currentDraft of invalids) {
    const result = await render({ currentDraft: currentDraft as typeof draft });
    assert.equal(result.error, null); assert.equal(result.review?.props.linkedTeam, null);
  }
});

test("missing or inactive players and unavailable team reads preserve the existing manual review", async () => {
  for (const options of [{ currentPlayers: players.slice(1) }, { currentPlayers: players.map((player, index) => index === 0 ? { ...player, status: "INACTIVE" } : player) }, { teamState: "error" }, { teamState: "unavailable" }]) {
    const result = await render(options);
    assert.equal(result.error, null); assert.ok(result.review); assert.equal(result.review.props.linkedTeam, null);
  }
});

test("an unauthorized linked review stops before reading submissions, drafts or catalogs", async () => {
  const result = await render({ unauthorized: true });
  assert.ok(result.error); assert.deepEqual(result.calls.map((call) => call.kind), ["auth"]);
});
