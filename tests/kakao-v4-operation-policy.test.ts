import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as crypto from "node:crypto";
import { Script } from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as http from "../src/platform/http/index";
import * as domain from "../src/modules/recruiting/kakao-v4/domain";
import * as application from "../src/modules/recruiting/kakao-v4/application";
import * as errors from "../src/modules/recruiting/kakao-v4/http";
import * as scope from "../src/modules/recruiting/kakao-v4/installation-scope";
import * as classifier from "../src/modules/recruiting/kakao-v4/classifier";
import * as operationAccess from "../src/modules/recruiting/kakao-v4/operation-access";
import * as adminDomain from "../src/modules/recruiting/kakao-admin/domain";
import * as communityModuleAccess from "../src/modules/community-sites/domain/module-access";

function load(path: string, dependencies: Record<string, unknown>) {
  const code = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports: Record<string, unknown> = {};
  new Script(code, { filename: path }).runInNewContext({ exports, require(id: string) {
    assert.ok(Object.hasOwn(dependencies, id), `Unexpected import: ${id}`); return dependencies[id];
  }, Request, Response, Headers, URL, Buffer, TextEncoder, Uint8Array, Date, performance,
  process: { env: { V2_PUBLIC_ORIGIN: "https://synthetic.invalid" } }, console: { info() {}, warn() {} } });
  return exports;
}

function harness() {
  const disabledCommunityModules = new Set<string>();
  let settingsReads = 0;
  let settingsUnavailable = false;
  const settings = { globalEnabled: true, maintenanceMode: false, recruitingEnabled: true,
    seasonApplicationsEnabled: true, playerSearchEnabled: true, scheduledNoticeEnabled: true,
    imageReceiveEnabled: true, maxMessageLength: 4000 };
  const adminRuntime = load("src/modules/recruiting/kakao-admin/runtime.ts", {
    "server-only": {}, "@/platform/db/client": { getDatabase: () => ({ synthetic: true }) },
    "./postgres-kakao-admin": { PostgresKakaoAdmin: class {
      async getSettings() { settingsReads++; if (settingsUnavailable) throw new Error("synthetic unavailable"); return settings; }
    } }, "./domain": adminDomain,
  });
  const identity = Buffer.from("synthetic-identity-key-for-policy-0123456789");
  const signing = Buffer.from("synthetic-signing-key-for-policy-9876543210");
  const dispatches: unknown[] = [];
  const route = load("src/app/api/integrations/kakao/v4/commands/route.ts", {
    "node:crypto": crypto, "@/platform/http": http,
    "@/modules/recruiting/kakao-assistant/runtime-assistant": { getRuntimeKakaoAssistant: () => ({ synthetic: true }) },
    "@/modules/recruiting/infrastructure/runtime-recruiting": { getRuntimeRecruitingService: () => ({ synthetic: true }) },
    "@/modules/recruiting/operation-forms/runtime": { getRuntimeOperationForms: () => ({ synthetic: true }) },
    "@/modules/recruiting/infrastructure/kakao-http-request": { readBoundedKakaoRawBody: async (r: Request) => new Uint8Array(await r.arrayBuffer()) },
    "@/modules/recruiting/kakao-v4/application": application,
    "@/modules/recruiting/kakao-v4/classifier": classifier,
    "@/modules/recruiting/kakao-v4/operation-access": operationAccess,
    "@/modules/community-sites/domain/module-access": communityModuleAccess,
    "@/modules/community-sites/infrastructure/module-access": { requireCommunityModule: async (_request: Request, moduleId: string) => disabledCommunityModules.has(moduleId) ? Response.json({ code: "COMMUNITY_MODULE_DISABLED" }, { status: 403 }) : null },
    "@/modules/recruiting/kakao-v4/dispatcher": { KakaoV4CommandDispatcher: class {
      async dispatch(_context: unknown, command: unknown) {
        dispatches.push(command); return { legacyReply: "synthetic-dispatch-reached", replayed: false };
      }
    } },
    "@/modules/recruiting/kakao-v4/domain": domain,
    "@/modules/recruiting/kakao-v4/http": errors,
    "@/modules/recruiting/kakao-v4/installation-scope": { ...scope,
      getRuntimeKakaoV4ProfileAuthorizer: () => new scope.KakaoV4InstallationScopeAuthorizer(identity),
      getRuntimeKakaoV4SigningSecrets: () => [{ keyId: "synthetic", secret: signing }],
    },
    "@/modules/recruiting/kakao-admin/runtime": adminRuntime,
  });
  function request(text = "5인파티", profileId: domain.KakaoV4ProfileId = "RECRUIT", eventId = `event-policy-${crypto.randomUUID()}`) {
    const envelope = { profileId, installationId: scope.kakaoV4InstallationId(profileId, identity),
      senderId: `sender-user-${"a".repeat(32)}`, eventId,
      timestamp: Math.floor(Date.now() / 1000), nonce: "b".repeat(32), text,
      protocol: domain.KAKAO_V1_STRICT_PROTOCOL, responseFormat: domain.KAKAO_V1_STRICT_RESPONSE_FORMAT };
    const body = JSON.stringify(envelope);
    const signature = `v4=${crypto.createHmac("sha256", signing).update(domain.kakaoV4SignatureMaterial("synthetic", crypto.createHash("sha256").update(body).digest("hex"))).digest("hex")}`;
    return new Request("https://synthetic.invalid/api/integrations/kakao/v4/commands", {
      method: "POST", headers: { "content-type": "application/json", "idempotency-key": eventId,
        "x-klol-key-id": "synthetic", "x-klol-signature": signature }, body,
    });
  }
  return { settings, dispatches, request, disabledCommunityModules, post: route.POST as (request: Request) => Promise<Response>,
    settingsReads: () => settingsReads, unavailable: () => { settingsUnavailable = true; } };
}

test("managed community recruiting pause blocks authenticated new commands but retains guidance and status", async () => {
  const h = harness();
  h.disabledCommunityModules.add("recruiting");
  const blocked = await h.post(h.request("5인파티"));
  assert.equal(blocked.status, 403);
  assert.equal((await blocked.json()).code, "COMMUNITY_MODULE_DISABLED");
  assert.equal(h.dispatches.length, 0);
  assert.equal((await h.post(h.request("구인도움말"))).status, 200);
  assert.equal((await h.post(h.request("내전현황", "FEATURES"))).status, 200);
  h.disabledCommunityModules.delete("recruiting");
  assert.equal((await h.post(h.request("5인파티"))).status, 200);
});

test("signed V4 requests honor global/maintenance switches and fail closed before dispatch", async () => {
  for (const disabled of ["global", "maintenance", "database"] as const) {
    const h = harness();
    if (disabled === "global") h.settings.globalEnabled = false;
    if (disabled === "maintenance") h.settings.maintenanceMode = true;
    if (disabled === "database") h.unavailable();
    const result = await h.post(h.request());
    assert.equal(result.status, 503, disabled);
    assert.equal((await result.json()).code, "KAKAO_OPERATION_DISABLED");
    assert.equal(h.settingsReads(), 1);
    assert.equal(h.dispatches.length, 0);
  }
});

test("V4 routes apply each feature switch independently and retain enabled commands", async () => {
  const cases = [
    ["recruitingEnabled", "5인파티", "RECRUIT"],
    ["seasonApplicationsEnabled", "내전현황", "FEATURES"],
    ["playerSearchEnabled", "랭킹", "FEATURES"],
    ["scheduledNoticeEnabled", "자동공지", "FEATURES"],
    ["imageReceiveEnabled", "사진상태", "FEATURES"],
  ] as const;
  for (const [feature, text, profile] of cases) {
    const h = harness();
    assert.equal(operationAccess.kakaoV4OperationFeature(classifier.classifyKakaoV4Command({ text, profileId: profile })), feature, text);
    h.settings[feature] = false;
    assert.equal((await h.post(h.request(text, profile))).status, 503, text);
    assert.equal(h.dispatches.length, 0);
    // Guidance is available when only an individual feature is disabled.
    assert.equal((await h.post(h.request("구인도움말"))).status, 200);
    h.settings[feature] = true;
    assert.equal((await h.post(h.request(text, profile))).status, 200, text);
  }
});

test("V4 checks fresh policy before cached replays and does not cache temporary blocks", async () => {
  const h = harness();
  const request = h.request();
  assert.equal((await h.post(request.clone())).status, 200);
  h.settings.maintenanceMode = true;
  assert.equal((await h.post(request.clone())).status, 503);
  h.settings.maintenanceMode = false;
  const replay = await h.post(request.clone());
  assert.equal(replay.status, 200);
  assert.equal(replay.headers.get("Idempotency-Replayed"), "true");
  assert.equal(h.dispatches.length, 1);
  const blockedRequest = h.request();
  h.settings.globalEnabled = false;
  assert.equal((await h.post(blockedRequest.clone())).status, 503);
  h.settings.globalEnabled = true;
  assert.equal((await h.post(blockedRequest.clone())).status, 200);
  assert.equal(h.dispatches.length, 2);
});

test("V4 enforces normalized message length and authenticates before reading policy", async () => {
  const h = harness();
  h.settings.maxMessageLength = 100;
  assert.equal((await h.post(h.request(`전적 ${"가".repeat(101)}`, "FEATURES"))).status, 503);
  const bad = h.request(); bad.headers.set("x-klol-signature", `v4=${"0".repeat(64)}`);
  assert.equal((await h.post(bad)).status, 401);
  assert.equal(h.settingsReads(), 1);
  assert.equal(h.dispatches.length, 0);
});
