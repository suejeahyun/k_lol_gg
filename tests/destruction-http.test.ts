import assert from "node:assert/strict";
import test from "node:test";

import type { AuthSession } from "../src/modules/auth/domain/auth-session";
import {
  DestructionService,
  destructionAdminMinimumRole,
  parseDestructionAdminAction,
  parseDestructionListQuery,
  type DestructionCommandContext,
  type DestructionHttpCommand,
  type DestructionMutationResult,
} from "../src/modules/competitions/destruction";
import { prepareDestructionMutation } from "../src/modules/competitions/destruction/destruction-http";

const tournamentId = "10000000-0000-4000-8000-000000000001";
const applicationId = "10000000-0000-4000-8000-000000000002";
const playerId = "10000000-0000-4000-8000-000000000003";
const candidateId = "10000000-0000-4000-8000-000000000004";

test("destruction list query is an explicit single-value allowlist", () => {
  assert.deepEqual(parseDestructionListQuery("https://v2.invalid/competitions?q=%20%ED%95%9C%20%20%EA%B2%BD%EA%B8%B0%20&status=RECRUITING&format=SWISS_ROUND_BO3&page=2&pageSize=24"), {
    query: "한 경기", status: "RECRUITING", format: "SWISS_ROUND_BO3", page: 2, pageSize: 24,
  });
  assert.equal(parseDestructionListQuery("https://v2.invalid/competitions?status=RECRUITING&status=COMPLETED"), null);
  assert.equal(parseDestructionListQuery("https://v2.invalid/competitions?ownerUserAccountId=secret"), null);
  assert.equal(parseDestructionListQuery("https://v2.invalid/competitions?pageSize=1000"), null);
});

test("admin parser covers lifecycle commands and rejects unknown or extra material", () => {
  assert.deepEqual(parseDestructionAdminAction({ type: "SELL_AUCTION", payload: { participantId: applicationId, teamId: tournamentId, purchasePoints: 330 } }), {
    type: "SELL_AUCTION", payload: { participantId: applicationId, teamId: tournamentId, purchasePoints: 330 },
  });
  assert.deepEqual(parseDestructionAdminAction({ type: "CORRECT_TOURNAMENT_RESULT", payload: { fixtureId: "final-1", teamAScore: 2, teamBScore: 1, winnerTeamId: "team-a" } }).type, "CORRECT_TOURNAMENT_RESULT");
  assert.throws(() => parseDestructionAdminAction({ type: "DRAW_AUCTION", payload: { seed: "client-overrides-seed" } }), /INVALID_INPUT/);
  assert.throws(() => parseDestructionAdminAction({ type: "UNKNOWN", payload: {} }), /INVALID_INPUT/);
  assert.equal(destructionAdminMinimumRole("RECORD_TOURNAMENT_RESULT"), "ADMIN");
  assert.equal(destructionAdminMinimumRole("CORRECT_TOURNAMENT_RESULT"), "SUPER_ADMIN");
  assert.equal(destructionAdminMinimumRole("REPLACE_PARTICIPANT"), "SUPER_ADMIN");
  assert.equal(destructionAdminMinimumRole("RESET_MVP"), "SUPER_ADMIN");
});

function context(purpose: "ACCOUNT" | "ADMIN", role: "USER" | "ADMIN" | "SUPER_ADMIN" = purpose === "ACCOUNT" ? "USER" : "ADMIN"): DestructionCommandContext {
  return { actorSession: { userAccountId: "10000000-0000-4000-8000-000000000010", sessionId: "10000000-0000-4000-8000-000000000011", role, authVersion: 4 }, purpose, requestId: "10000000-0000-4000-8000-000000000012", idempotencyMaterial: new Uint8Array([1, 2, 3]) };
}

test("service binds owner identity, request fingerprint and SUPER-sensitive intent server-side", async () => {
  const commands: DestructionHttpCommand[] = [];
  const service = new DestructionService({ async handle(command) { commands.push(command); return { body: { tournamentId, revision: 1, status: "RECRUITING", commandType: command.type }, revision: 1, replayed: false } satisfies DestructionMutationResult; } });
  await service.upsertOwnApplication(context("ACCOUNT"), tournamentId, playerId, 3, { applicationId, position: "MID" });
  assert.equal(commands[0]?.type, "UPSERT_OWN_APPLICATION");
  assert.deepEqual(commands[0]?.metadata.authorizationIntent, { kind: "APPROVED_OWNER", ownerUserAccountId: "10000000-0000-4000-8000-000000000010", playerId, requireApprovedAccount: true, requireOwnership: true, transactionRecheck: true });
  assert.equal(commands[0]?.metadata.idempotency.requestFingerprint.byteLength, 32);

  assert.throws(() => service.executeAdmin(context("ADMIN", "ADMIN"), tournamentId, 3, { type: "ASSIGN_MVP", payload: { fixtureId: "fixture-1", playerId: candidateId } }), /FORBIDDEN/);
  await service.executeAdmin(context("ADMIN", "SUPER_ADMIN"), tournamentId, 3, { type: "ASSIGN_MVP", payload: { fixtureId: "fixture-1", playerId: candidateId } });
  assert.equal(commands[1]?.metadata.authorizationIntent.kind, "ADMIN_TOTP");
  assert.equal(commands[1]?.metadata.authorizationIntent.kind === "ADMIN_TOTP" && commands[1].metadata.authorizationIntent.minimumRole, "SUPER_ADMIN");
});

test("HTTP mutation boundary requires same origin, If-Match and Idempotency-Key", async () => {
  const session: AuthSession = { sessionId: "10000000-0000-4000-8000-000000000011", userId: "10000000-0000-4000-8000-000000000010", role: "USER", purpose: "ACCOUNT", accountStatus: "APPROVED", mustChangePassword: false, authVersion: 4, adminTotpVerified: false, source: "database", issuedAt: 1, expiresAt: 2 };
  const previousOrigin = process.env.V2_PUBLIC_ORIGIN;
  process.env.V2_PUBLIC_ORIGIN = "https://v2.example";
  try {
    const valid = await prepareDestructionMutation(new Request("https://v2.example/api/competitions/destruction", { method: "PUT", headers: { Origin: "https://v2.example", "Content-Type": "application/json", "If-Match": '"3"', "Idempotency-Key": "destruction-application-12345678" }, body: JSON.stringify({ applicationId, position: "MID" }) }), session, "destruction:application:upsert");
    assert.equal(valid.ok, true);
    if (valid.ok) assert.equal(valid.value.expectedRevision, 3);
    const crossOrigin = await prepareDestructionMutation(new Request("https://v2.example/api/competitions/destruction", { method: "PUT", headers: { Origin: "https://evil.example", "Content-Type": "application/json", "If-Match": '"3"', "Idempotency-Key": "destruction-application-12345678" }, body: "{}" }), session, "destruction:application:upsert");
    assert.equal(crossOrigin.ok, false);
    if (!crossOrigin.ok) assert.equal(crossOrigin.response.status, 403);
  } finally {
    if (previousOrigin === undefined) delete process.env.V2_PUBLIC_ORIGIN;
    else process.env.V2_PUBLIC_ORIGIN = previousOrigin;
  }
});
