import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const acorn = require("next/dist/compiled/acorn");
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

function declaredFunctions(source) {
  const program = acorn.parse(source, { ecmaVersion: 5, allowReserved: true, preserveParens: true });
  const functions = new Map();
  for (const node of program.body) {
    if (node.type === "FunctionDeclaration") functions.set(node.id.name, source.slice(node.start, node.end));
  }
  return functions;
}

test("canonical V40 R2 routes managed commands to site-first links, not the legacy image session creator", async () => {
  const source = await read("tests/fixtures/kakao/v1/KLOL_KAKAO_BOT_V40_GUIDED_HUB.js");
  const functions = declaredFunctions(source);
  const response = functions.get("response");
  const siteFirst = functions.get("handleSiteFirstManagedWorkflow");
  assert.ok(response);
  assert.ok(siteFirst);
  assert.match(response, /isManagedWorkflowMessage\(text\)[\s\S]*handleSiteFirstManagedWorkflow\(text, replier\)[\s\S]*return/u);
  assert.doesNotMatch(response, /handleManagedWorkflowMessage\(/u);
  assert.doesNotMatch(siteFirst, /handleManagedWorkflowMessage|rememberManagedUploadCode|managedUploadSaveKey/u);
  assert.equal((source.match(/handleManagedWorkflowMessage\(/gu) ?? []).length, 1, "declaration only");
});

test("a clean V1-strict install keeps imageDB silent instead of inventing an unreachable UUID flow", async () => {
  const adapter = await read("integrations/messengerbot-r/v1-strict/KLOL_KAKAO_BOT_V1_STRICT_ADAPTER.js");
  const functions = declaredFunctions(adapter);
  assert.match(functions.get("handleManagedImage") ?? "", /return false;/u);
  assert.match(functions.get("replyManagedImageFallback") ?? "", /return false;/u);
  assert.doesNotMatch(adapter, /V2사진세션|\/api\/integrations\/kakao\/v4\/image-receive/u);
});

test("the dormant legacy image receiver remains secure for non-strict clients without reopening bearer access", async () => {
  const [route, requestBoundary, service] = await Promise.all([
    read("src/app/api/integrations/kakao/image-receive/route.ts"),
    read("src/modules/recruiting/infrastructure/kakao-http-request.ts"),
    read("src/modules/recruiting/kakao-assistant/postgres-kakao-image-receive.ts"),
  ]);
  assert.match(route, /prepareKakaoSignedJson\(request, MAXIMUM_KAKAO_IMAGE_BODY_BYTES/u);
  assert.match(requestBoundary, /MAXIMUM_KAKAO_IMAGE_BODY_BYTES = 4_200_000/u);
  assert.match(service, /session\.status !== "ACTIVE"/u);
  assert.match(service, /sameBytes\(session\.senderIdHash, hiddenIdentity\("sender", input\.intent\.senderId\)\)/u);
  assert.doesNotMatch(route, /Authorization|Bearer|x-kakao-recruit-secret/u);
});
