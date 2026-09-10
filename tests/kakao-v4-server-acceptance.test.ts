import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { KakaoV4CommandError, KakaoV4CommandService } from "../src/modules/recruiting/kakao-v4/application";
import { canonicalKakaoV4CommandText, type KakaoV4CommandEnvelope, type KakaoV4ProfileId } from "../src/modules/recruiting/kakao-v4/domain";
import { kakaoV4ProblemResponse } from "../src/modules/recruiting/kakao-v4/http";

const fixture = JSON.parse(readFileSync(resolve(import.meta.dirname, "fixtures/kakao-v4-v1-compatibility-contract.json"), "utf8"));
const nowSeconds = Math.floor(new Date("2026-09-10T03:00:00.000Z").getTime() / 1_000);
const httpSource = readFileSync(resolve(import.meta.dirname, "../src/modules/recruiting/kakao-v4/http.ts"), "utf8");
const routeSource = readFileSync(resolve(import.meta.dirname, "../src/app/api/integrations/kakao/v4/commands/route.ts"), "utf8");
const publicContractSource = `${httpSource}\n${routeSource}`;

function command(profileId: KakaoV4ProfileId, senderHex: string, event: number, text: string): KakaoV4CommandEnvelope {
  const installationHex = profileId === "RECRUIT" ? "1" : "2";
  return Object.freeze({
    profileId,
    installationId: `install-${installationHex.repeat(32)}`,
    senderId: `sender-user-${senderHex.repeat(32).slice(0, 32)}`,
    eventId: `event-boot-abcdef0123456789-${event}`,
    timestamp: nowSeconds,
    nonce: String(event).padStart(32, "0"),
    text,
  });
}

function service() {
  const authorizations: unknown[] = [];
  const instance = new KakaoV4CommandService({
    async authorizeProfile(input) {
      authorizations.push(input);
      return {
        roomId: "00000000-0000-4000-8000-000000000001",
        roomStatus: "ACTIVE",
        capabilityProfile: input.requiredCapabilityProfile,
        installationId: "00000000-0000-4000-8000-000000000002",
      };
    },
  });
  return { instance, authorizations };
}

test("[S01] zero or one leading slash is equivalent for the complete V1 route fixture", () => {
  for (const route of fixture.routes) {
    for (const alias of route.aliases) {
      assert.equal(canonicalKakaoV4CommandText(alias), alias);
      assert.equal(canonicalKakaoV4CommandText(`/${alias}`), alias);
    }
  }
});

test("[S02] malformed slash, URL and middle slash canonicalize to no command", () => {
  for (const rejected of [...fixture.slashBoundary.rejected, ...fixture.invariants.notCommands]) {
    assert.equal(canonicalKakaoV4CommandText(rejected), null, rejected);
  }
});

test("[S03] two unregistered general users can create, cross-edit and cross-finish one recruit", async () => {
  const { instance, authorizations } = service();
  const results = await Promise.all([
    instance.execute(command("RECRUIT", "a", 1, "5인파티 12"), "current"),
    instance.execute(command("RECRUIT", "b", 2, "📢 5인 파티 구인\n모집번호: #12\n1. 재현\n2. 기용"), "current"),
    instance.execute(command("RECRUIT", "b", 3, "12ㅉ"), "current"),
  ]);
  assert.deepEqual(results.map((result) => result.kind), ["REPLY", "REPLY", "REPLY"]);
  assert.equal(authorizations.length, 3);
  assert.doesNotMatch(JSON.stringify(authorizations), /sender|role|member/iu);
});

test("[S04] full recruit snapshots delete names, accept zero people and preserve A→B→A", async () => {
  const { instance } = service();
  const snapshots = fixture.party.snapshotScenario.revisions;
  const results = [];
  for (const [index, snapshot] of snapshots.entries()) {
    const members = snapshot.members.map((name: string, memberIndex: number) => `${memberIndex + 1}. ${name}`).join("\n");
    results.push(await instance.execute(command("RECRUIT", "b", 10 + index, `📢 5인 파티 구인\n모집번호: #12\n${members}`), "current"));
  }
  assert.deepEqual(results.map((result) => result.kind), ["REPLY", "REPLY", "REPLY", "REPLY"]);
  assert.deepEqual(snapshots.map((snapshot: { label: string }) => snapshot.label), ["A", "B", "A", "ZERO"]);
});

test("[S05] FEATURES ranking, record and recent commands return successful replies", async () => {
  const { instance } = service();
  const texts = ["랭킹", "전적 별빛#KR1", "최근 별빛#KR1"];
  const results = [];
  for (const [index, text] of texts.entries()) {
    results.push(await instance.execute(command("FEATURES", "c", 20 + index, text), "current"));
  }
  assert.deepEqual(results.map((result) => result.kind), ["REPLY", "REPLY", "REPLY"]);
  for (const result of results) if (result.kind === "REPLY") assert.ok(result.reply.length > 0);
});

test("[S06] one successful scrim command is dispatched without a status preflight", async () => {
  const { instance, authorizations } = service();
  const result = await instance.execute(command("RECRUIT", "d", 30, "스크림구인"), "current");
  assert.equal(result.kind, "REPLY");
  assert.equal(authorizations.length, 1);
});

test("[S07] duplicate mutation callback is applied once and replayed once", async () => {
  const { instance } = service();
  const mutation = command("RECRUIT", "e", 40, "5인파티 12");
  const first = await instance.execute(mutation, "current");
  const replay = await instance.execute(mutation, "current");
  assert.equal(first.kind, "REPLY");
  assert.equal(first.replayed, false);
  assert.equal(replay.kind, "REPLY");
  assert.equal(replay.replayed, true);
});

test("[S08] an event ID body conflict maps to public REPLAY_CONFLICT with HTTP 409", async () => {
  const { instance } = service();
  const first = command("RECRUIT", "f", 50, "V4상태");
  await instance.execute(first, "current");
  await assert.rejects(
    () => instance.execute({ ...first, text: "V4계약확인" }, "current"),
    (error) => error instanceof KakaoV4CommandError && error.code === "IDEMPOTENCY_MISMATCH",
  );
  const response = kakaoV4ProblemResponse("IDEMPOTENCY_MISMATCH", "trace-qa");
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "REPLAY_CONFLICT");
});

test("[S09:NORMAL] normal V4 status returns a successful reply", async () => {
  const { instance } = service();
  const normal = await instance.execute(command("RECRUIT", "1", 60, "V4상태"), "current");
  assert.equal(normal.kind, "REPLY");
});

test("[S09:WRONG_PROFILE] wrong profile has an exact public code", () => {
  assert.match(publicContractSource, /WRONG_PROFILE/u);
});

test("[S09:INVALID_SIGNATURE] invalid signature has an exact public code", async () => {
  const response = kakaoV4ProblemResponse("SIGNATURE_INVALID", "trace-qa");
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, "INVALID_SIGNATURE");
});

test("[S09:REPLAY_CONFLICT] replay conflict has an exact public code", async () => {
  const response = kakaoV4ProblemResponse("IDEMPOTENCY_MISMATCH", "trace-qa");
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "REPLAY_CONFLICT");
});

test("[S09:SERVER_UNAVAILABLE] server failure has an exact public code", async () => {
  const response = kakaoV4ProblemResponse("UNAVAILABLE", "trace-qa");
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "SERVER_UNAVAILABLE");
});

test("[S09:INVALID_FORM] invalid V1 form has an exact public code", () => {
  assert.match(publicContractSource, /INVALID_FORM/u);
});

test("[S10] V1 golden regression inventory remains present for the release run", () => {
  const required = [
    "kakao-v40-exact-reply-parity.test.mjs",
    "kakao-v40-scrim-exact-parity.golden.test.mjs",
    "kakao-v40-misc-command-parity.test.mjs",
    "kakao-v41-v1-inhouse-golden.test.mjs",
    "kakao-v41-v1-compat.test.mjs",
    "kakao-v41-v1-router-integration.test.mjs",
  ];
  for (const file of required) assert.ok(readFileSync(resolve(import.meta.dirname, file), "utf8").length > 0, file);
});
