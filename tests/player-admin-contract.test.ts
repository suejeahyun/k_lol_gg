import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { parseAdminPlayerQuery } from "../src/modules/players/application/parse-admin-player-query";
import {
  MAXIMUM_LEGACY_PLAYER_ID,
  parseLegacyPlayerId,
  parsePlayerWriteInput,
  playerMutationFingerprint,
} from "../src/modules/players/domain/admin-player";

const validInput = {
  memberName: "합성 회원",
  nickname: "SkyFox",
  tagLine: "V2",
  legacyId: 42,
  peakTier: "DIAMOND II",
  currentTier: "에메랄드 1",
};

test("player write DTO is an allowlist with normalized validated values", () => {
  assert.deepEqual(parsePlayerWriteInput(validInput), { ok: true, value: validInput });
  assert.deepEqual(
    parsePlayerWriteInput({ ...validInput, memberName: "  합성   회원  ", tagLine: "#V2" }),
    { ok: false, field: "tagLine", reason: "INVALID" },
  );
  assert.deepEqual(
    parsePlayerWriteInput({ ...validInput, userAccountId: "must-not-cross-the-boundary" }),
    { ok: false, field: "userAccountId", reason: "UNKNOWN" },
  );
  assert.deepEqual(
    parsePlayerWriteInput({ ...validInput, revision: 99 }),
    { ok: false, field: "revision", reason: "UNKNOWN" },
  );
  assert.equal(parsePlayerWriteInput({ ...validInput, peakTier: "unverified tier" }).ok, false);
  assert.equal(parsePlayerWriteInput({ ...validInput, nickname: "a".repeat(17) }).ok, false);
  assert.equal(parsePlayerWriteInput({ ...validInput, tagLine: "TOOLNG" }).ok, false);
  assert.equal(parsePlayerWriteInput({ ...validInput, legacyId: 0 }).ok, false);
  assert.equal(parsePlayerWriteInput({ ...validInput, legacyId: MAXIMUM_LEGACY_PLAYER_ID + 1 }).ok, false);
});

test("legacy numeric ids accept only the positive PostgreSQL integer range", () => {
  assert.equal(parseLegacyPlayerId("42"), 42);
  assert.equal(parseLegacyPlayerId(MAXIMUM_LEGACY_PLAYER_ID), MAXIMUM_LEGACY_PLAYER_ID);
  for (const value of ["0", "01", "1.5", "-1", MAXIMUM_LEGACY_PLAYER_ID + 1, Number.MAX_SAFE_INTEGER]) {
    assert.equal(parseLegacyPlayerId(value), null);
  }
});

test("administrator player query rejects duplicates, unknown keys, and oversized values", () => {
  assert.deepEqual(
    parseAdminPlayerQuery(new URLSearchParams("q=SkyFox&status=active&page=2&pageSize=10")),
    { ok: true, value: { query: "SkyFox", status: "ACTIVE", page: 2, pageSize: 10 } },
  );
  assert.deepEqual(parseAdminPlayerQuery(new URLSearchParams("q=a&q=b")), { ok: false });
  assert.deepEqual(parseAdminPlayerQuery(new URLSearchParams("private=true")), { ok: false });
  assert.deepEqual(parseAdminPlayerQuery(new URLSearchParams(`q=${"x".repeat(101)}`)), { ok: false });
  for (const query of ["page=01", "page=1e2", "page=1.5", "pageSize=0", "pageSize=%203%20"]) {
    assert.deepEqual(parseAdminPlayerQuery(new URLSearchParams(query)), { ok: false });
  }
});

test("mutation fingerprint is canonical and changes with revision or allowlisted input", () => {
  const first = playerMutationFingerprint({ action: "update", playerId: "player", expectedRevision: 1, player: validInput });
  const same = playerMutationFingerprint({ action: "update", playerId: "player", expectedRevision: 1, player: { ...validInput } });
  const stale = playerMutationFingerprint({ action: "update", playerId: "player", expectedRevision: 0, player: validInput });
  const reactivation = playerMutationFingerprint({ action: "reactivate", playerId: "player", expectedRevision: 1 });
  assert.equal(first, same);
  assert.notEqual(first, stale);
  assert.notEqual(first, reactivation);
});

test("legacy detail mapping remains outside proxy and administrator APIs use the shared HTTP contract", () => {
  const proxySource = readFileSync(new URL("../src/proxy.ts", import.meta.url), "utf8");
  const legacyRoute = readFileSync(new URL("../src/app/(public)/(legacy)/app/players/[legacyId]/route.ts", import.meta.url), "utf8");
  const collectionRoute = readFileSync(new URL("../src/app/api/admin/players/route.ts", import.meta.url), "utf8");
  const itemRoute = readFileSync(new URL("../src/app/api/admin/players/[playerId]/route.ts", import.meta.url), "utf8");
  const reactivateRoute = readFileSync(new URL("../src/app/api/admin/players/[playerId]/reactivate/route.ts", import.meta.url), "utf8");
  const playerLifecycleUi = readFileSync(new URL("../src/components/admin/players/admin-player-form.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(proxySource, /platform\/db|PostgresPublicPlayerLegacyMappingRepository|getDatabase/);
  assert.match(legacyRoute, /resolveRuntimePublicPlayerLegacyMapping/);
  assert.match(legacyRoute, /status:\s*308/);
  assert.match(legacyRoute, /PLAYER_HTTP_PROBLEMS\.notFound/);
  assert.match(collectionRoute, /readJsonBody/);
  assert.match(collectionRoute, /buildPlayerMutationCommand/);
  assert.match(itemRoute, /readIfMatchRevision/);
  assert.match(itemRoute, /playerMutationResponse/);
  assert.match(reactivateRoute, /guardAdminMutationOrigin/);
  assert.match(reactivateRoute, /readIfMatchRevision/);
  assert.match(reactivateRoute, /buildPlayerMutationCommand/);
  assert.match(reactivateRoute, /repository\.reactivate/);
  assert.match(playerLifecycleUi, /재활성화 준비/);
  assert.match(playerLifecycleUi, /재활성화 확인/);
  assert.match(playerLifecycleUi, /maxLength=\{16\}/);
  assert.match(playerLifecycleUi, /maxLength=\{5\}/);
});
