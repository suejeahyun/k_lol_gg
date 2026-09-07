import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFile(resolve(root, path), "utf8");

test("Kakao assistant routes share raw-body HMAC and durable read receipts", async () => {
  const [request, adapter, search, openchat, notice] = await Promise.all([
    read("src/modules/recruiting/infrastructure/kakao-http-request.ts"),
    read("src/modules/recruiting/kakao-assistant/postgres-kakao-assistant.ts"),
    read("src/app/api/integrations/kakao/search-player/route.ts"),
    read("src/app/api/integrations/kakao/openchat/route.ts"),
    read("src/app/api/integrations/kakao/scheduled-notice/route.ts"),
  ]);
  for (const evidence of ["readBoundedKakaoRawBody", "verifyKakaoWebhook", "x-klol-nonce", "x-klol-room", "x-klol-sender", "x-klol-bot-self"]) {
    assert.match(request, new RegExp(evidence));
  }
  for (const evidence of ["recruitingNonceBindings", "recruitingCommandReceipts", "pg_advisory_xact_lock", "IDEMPOTENCY_MISMATCH", "NONCE_CONFLICT"]) {
    assert.match(adapter, new RegExp(evidence));
  }
  assert.match(search, /parsePlayerSearchBody/u);
  assert.match(openchat, /getOpenChatStatus/u);
  assert.match(notice, /getScheduledNotice/u);
  assert.doesNotMatch(notice, /fetch\(|sendMessage|axios/u);
});

test("managed forms remain isolated while season snapshots and owner-bound images are durable", async () => {
  const [managed, season, image, matchSession, disciplineSession] = await Promise.all([
    read("src/app/api/integrations/kakao/managed-forms/route.ts"),
    read("src/app/api/integrations/kakao/season-applications/route.ts"),
    read("src/app/api/integrations/kakao/image-receive/route.ts"),
    read("src/app/api/me/match-submissions/[code]/kakao-session/route.ts"),
    read("src/app/api/me/discipline/tasks/[taskId]/kakao-session/route.ts"),
  ]);
  assert.match(managed, /parseManagedOperationFormBody/u);
  assert.match(managed, /getRuntimeOperationForms/u);
  assert.doesNotMatch(managed, /Season|PrivateAsset|fetch\(/u);
  assert.match(season, /parseSeasonSnapshotBody/u);
  assert.match(season, /syncSeasonSnapshot/u);
  assert.match(image, /parseKakaoImageReceiveBody/u);
  assert.match(image, /service\.receive/u);
  assert.doesNotMatch(image, /publicCode|targetType|fetch\(/u);
  for (const ownerRoute of [matchSession, disciplineSession]) {
    assert.match(ownerRoute, /require(?:Match|Discipline)ApiSession/u);
    assert.match(ownerRoute, /prepare(?:Match|Discipline)JsonMutation/u);
    assert.match(ownerRoute, /createOwnerSession/u);
    assert.match(ownerRoute, /revokeOwnerSession/u);
  }
});

test("legacy Kakao paths execute the signed canonical POST handlers without redirects", async () => {
  for (const path of [
    "src/app/api/kakao/search-player/route.ts",
    "src/app/api/kakao/openchat/route.ts",
    "src/app/api/kakao/managed-forms/route.ts",
    "src/app/api/kakao/scheduled-notice/route.ts",
    "src/app/api/kakao/image-receive/route.ts",
    "src/app/api/kakao/recruit/season-apply/route.ts",
    "src/app/api/kakao/recruit/season-apply/status/route.ts",
  ]) {
    const source = await read(path);
    assert.match(source, /POST/u);
    assert.doesNotMatch(source, /GET|redirect/u);
  }
});
