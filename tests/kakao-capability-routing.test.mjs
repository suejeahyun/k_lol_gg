import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");

const routes = {
  PUBLIC_KAKAO_ROOM_COMMAND: ["recruits", "operation-forms", "managed-forms", "openchat", "search-player", "season-applications"],
  TRUSTED_KAKAO_SENDER_COMMAND: ["scheduled-notice", "image-receive"],
};

test("Kakao route capability policy is explicit for every phone endpoint", async () => {
  for (const [capability, names] of Object.entries(routes)) {
    for (const name of names) {
      const source = await readFile(resolve(root, `src/app/api/integrations/kakao/${name}/route.ts`), "utf8");
      assert.match(source, new RegExp(`(?:prepareKakaoSignedJson|verifyKakaoHttpRequest)\\([^;]+${capability}\\)`), `${name} must explicitly require ${capability}`);
    }
  }
});

test("season member submissions and reads are public-room commands but force cancel has a trusted command gate", async () => {
  const source = await readFile(resolve(root, "src/app/api/integrations/kakao/season-applications/route.ts"), "utf8");
  assert.match(source, /kakaoSeasonCommandAccess\(command\.action\) === "TRUSTED_OPERATOR"/u);
  assert.match(source, /registry\.authorize/u);
  assert.match(source, /requiredRole: "ADMIN"/u);
  assert.match(source, /recordKakaoWebhookRejection\("ROLE_FORBIDDEN"/u);
});

test("normal room authorization uses only canonical registry state and keeps environment bootstrap explicit", async () => {
  const source = await readFile(resolve(root, "src/modules/recruiting/kakao-access/postgres-kakao-room-registry.ts"), "utf8");
  const authorizeStart = source.indexOf("async authorize(");
  const authorizeEnd = source.indexOf("\n  async list()", authorizeStart);
  assert.ok(authorizeStart > 0 && authorizeEnd > authorizeStart);
  const authorize = source.slice(authorizeStart, authorizeEnd);
  assert.doesNotMatch(authorize, /bootstrap|process\.env|KAKAO_WEBHOOK_ALLOWED_ROOMS|KAKAO_WEBHOOK_ALLOWED_SENDERS/u);
  assert.match(source, /async bootstrapFromEnvironment\(/u);
  assert.match(source, /ROOM_BINDING_REQUIRED/u);
});
