import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const source = (path) => readFile(resolve(root, path), "utf8");

test("Kakao routes are explicitly isolated between recruit and features installations", async () => {
  const recruitRoutes = await Promise.all([
    "src/app/api/integrations/kakao/recruits/route.ts",
    "src/app/api/integrations/kakao/openchat/route.ts",
    "src/app/api/integrations/kakao/search-player/route.ts",
  ].map(source));
  const featureRoutes = await Promise.all([
    "src/app/api/integrations/kakao/season-applications/route.ts",
    "src/app/api/integrations/kakao/operation-forms/route.ts",
    "src/app/api/integrations/kakao/managed-forms/route.ts",
    "src/app/api/integrations/kakao/image-receive/route.ts",
    "src/app/api/integrations/kakao/scheduled-notice/route.ts",
  ].map(source));

  for (const route of recruitRoutes) {
    assert.match(route, /RECRUIT_KAKAO_ROOM_COMMAND/u);
    assert.doesNotMatch(route, /FEATURES_KAKAO_ROOM_COMMAND/u);
  }
  for (const route of featureRoutes) {
    assert.match(route, /FEATURES_KAKAO_ROOM_COMMAND/u);
    assert.doesNotMatch(route, /RECRUIT_KAKAO_ROOM_COMMAND/u);
  }
});

test("wrong-room failures remain short and actionable on the phone", async () => {
  const transport = await source("integrations/messengerbot-r/KLOL_KAKAO_BOT_V41_V2_TRANSPORT.js");
  assert.match(transport, /ROOM_CAPABILITY_FORBIDDEN/u);
  assert.match(transport, /연결된 다른 K-LOL\.GG 카카오방/u);
});

test("recruit mutations expose PII-free stage timing for p50 and p95 aggregation", async () => {
  const route = await source("src/app/api/integrations/kakao/recruits/route.ts");
  assert.match(route, /Server-Timing/u);
  assert.match(route, /KAKAO_RECRUIT_PERF/u);
  const structuredLog = route.slice(route.indexOf('console.info("KAKAO_RECRUIT_PERF"'), route.indexOf('console.info("KAKAO_RECRUIT_PERF"') + 700);
  for (const sensitive of ["roomId", "senderId", "installationId", "rawBody", "secret"]) assert.doesNotMatch(structuredLog, new RegExp(sensitive, "u"));
});
