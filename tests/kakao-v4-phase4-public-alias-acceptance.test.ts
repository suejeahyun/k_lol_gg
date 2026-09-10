import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { KakaoV4CommandError, KakaoV4CommandService } from "../src/modules/recruiting/kakao-v4/application";
import type { KakaoV4CommandDispatcher } from "../src/modules/recruiting/kakao-v4/dispatcher";
import type { KakaoV4CommandEnvelope, KakaoV4ProfileId } from "../src/modules/recruiting/kakao-v4/domain";
import { kakaoV4CommandFailureResponse } from "../src/modules/recruiting/kakao-v4/http";

type PublicRoute = Readonly<{
  domain: "HELP" | "PARTY" | "INHOUSE" | "SCRIM" | "PLAYER" | "REGISTRATION";
  action: string;
  aliases: readonly string[];
}>;

type V1Fixture = Readonly<{
  routes: readonly PublicRoute[];
}>;

const fixture = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "fixtures/kakao-v4-v1-compatibility-contract.json"), "utf8"),
) as V1Fixture;

const timestamp = Date.parse("2026-09-10T03:00:00.000Z") / 1_000;
let eventSequence = 0;

function profiles(route: PublicRoute): readonly KakaoV4ProfileId[] {
  if (route.domain === "HELP" && route.action === "GENERAL_HELP") return ["RECRUIT", "FEATURES"];
  if (route.domain === "HELP" || route.domain === "PARTY" || route.domain === "SCRIM") return ["RECRUIT"];
  return ["FEATURES"];
}

function opposite(profile: KakaoV4ProfileId): KakaoV4ProfileId {
  return profile === "RECRUIT" ? "FEATURES" : "RECRUIT";
}

function envelope(profileId: KakaoV4ProfileId, text: string): KakaoV4CommandEnvelope {
  eventSequence += 1;
  return Object.freeze({
    profileId,
    installationId: `install-${profileId === "RECRUIT" ? "1".repeat(32) : "2".repeat(32)}`,
    senderId: "sender-user-33333333333333333333333333333333",
    eventId: `event-phase4-${String(eventSequence).padStart(8, "0")}`,
    timestamp,
    nonce: eventSequence.toString(16).padStart(32, "0"),
    text,
  });
}

function service() {
  const authorizations: unknown[] = [];
  const dispatches: unknown[] = [];
  const dispatcher = {
    async dispatch(context: Readonly<{ envelope: KakaoV4CommandEnvelope }>, command: unknown) {
      dispatches.push({ context, command });
      const record = command as Readonly<{ domain?: unknown; action?: unknown }>;
      return Object.freeze({
        kind: "PARTY",
        action: String(record.action ?? "STATUS"),
        aggregate: null,
        legacyReply: `[PHASE4:${String(record.domain)}:${String(record.action)}]`,
        replayed: false,
      });
    },
  } as unknown as KakaoV4CommandDispatcher;
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
  }, dispatcher);
  return { instance, authorizations, dispatches };
}

test("[P4-S01] every V1 PUBLIC alias succeeds on its actual profile with exact zero/one slash parity", async () => {
  const failures: string[] = [];
  let executions = 0;
  for (const route of fixture.routes) {
    for (const alias of route.aliases) {
      for (const profileId of profiles(route)) {
        const qa = service();
        const plain = await qa.instance.execute(envelope(profileId, alias), "current");
        const slash = await qa.instance.execute(envelope(profileId, `/${alias}`), "current");
        executions += 2;
        if (plain.kind !== "REPLY" || slash.kind !== "REPLY") {
          failures.push(`${profileId}:${route.domain}/${route.action}:${alias}: ${plain.kind}/${slash.kind}`);
          continue;
        }
        if (plain.reply !== slash.reply) failures.push(`${profileId}:${route.domain}/${route.action}:${alias}: reply mismatch`);
        if (/ROUTER_NOT_ENABLED|라우터가 아직 연결되지/u.test(`${plain.reply}\n${slash.reply}`)) {
          failures.push(`${profileId}:${route.domain}/${route.action}:${alias}: ROUTER_NOT_ENABLED leaked`);
        }
      }
    }
  }
  assert.equal(executions, 186, "fixture PUBLIC aliases or actual-profile matrix changed; review the Phase 4 contract");
  assert.deepEqual(failures, []);
});

test("[P4-S02] every single-profile PUBLIC alias maps its opposite profile to HTTP 403 WRONG_PROFILE", async () => {
  const failures: string[] = [];
  let executions = 0;
  for (const route of fixture.routes) {
    const allowed = profiles(route);
    if (allowed.length !== 1) continue;
    for (const alias of route.aliases) {
      executions += 1;
      const qa = service();
      let error: unknown;
      try {
        await qa.instance.execute(envelope(opposite(allowed[0]!), alias), "current");
      } catch (caught) {
        error = caught;
      }
      const response = kakaoV4CommandFailureResponse(error, "trace-phase4-wrong-profile");
      const body = await response.json() as { code?: unknown };
      if (!(error instanceof KakaoV4CommandError) || error.code !== "WRONG_PROFILE" || response.status !== 403 || body.code !== "WRONG_PROFILE") {
        failures.push(`${route.domain}/${route.action}:${alias}: ${response.status}/${String(body.code)}`);
      }
    }
  }
  assert.equal(executions, 89);
  assert.deepEqual(failures, []);
});

test("[P4-S03] authorization never receives room, sender, role or member allowlist fields", async () => {
  const qa = service();
  for (const [profileId, text] of [["RECRUIT", "5인파티"], ["FEATURES", "랭킹"]] as const) {
    const result = await qa.instance.execute(envelope(profileId, text), "current");
    assert.equal(result.kind, "REPLY");
  }
  assert.equal(qa.authorizations.length, 2);
  assert.doesNotMatch(JSON.stringify(qa.authorizations), /room|sender|role|member|allowlist/iu);
});

test("[P4-S04] unknown public input is INVALID_FORM instead of 501 ROUTER_NOT_ENABLED", async () => {
  for (const text of ["알수없는명령", "지원하지 않는 명령 123", "자동공지 13"]) {
    const qa = service();
    let error: unknown;
    try {
      await qa.instance.execute(envelope("FEATURES", text), "current");
    } catch (caught) {
      error = caught;
    }
    const response = kakaoV4CommandFailureResponse(error, "trace-phase4-invalid-form");
    const body = await response.json() as { code?: unknown };
    assert.equal(response.status, 400, text);
    assert.equal(body.code, "INVALID_FORM", text);
  }
});

test("[P4-S05] 사진상태 gives a site check path without claiming a nonexistent phone session is healthy", async () => {
  const qa = service();
  const result = await qa.instance.execute(envelope("FEATURES", "사진상태"), "current");
  assert.equal(result.kind, "REPLY");
  if (result.kind === "REPLY") {
    assert.match(result.reply, /사이트/u);
    assert.match(result.reply, /https:\/\/k-lol-gg\.vercel\.app/u);
    assert.doesNotMatch(result.reply, /연결되어 있습니다|정상(?:입니다|$)/u);
  }
  assert.equal(qa.dispatches.length, 0, "phone-local session status must not become a server mutation");
});

for (const [id, text] of [["P4-S06", "내전미리보기취소"], ["P4-S07", "내전확인 ABCD1234"]] as const) {
  test(`[${id}] ${text} returns a no-mutation discard notice`, async () => {
    const qa = service();
    const result = await qa.instance.execute(envelope("FEATURES", text), "current");
    assert.equal(result.kind, "REPLY");
    if (result.kind === "REPLY") {
      assert.match(result.reply, /사이트에는 반영하지 않았/u);
      assert.match(result.reply, /폐기|취소|확인할 (?:변경|미리보기).*(?:없|지났)/u);
    }
    assert.equal(qa.dispatches.length, 0, "deprecated preview commands must not dispatch or mutate");
  });
}
