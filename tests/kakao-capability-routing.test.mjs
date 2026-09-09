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
  assert.match(source, /KAKAO_WEBHOOK_ALLOWED_SENDERS/u);
  assert.match(source, /recordKakaoWebhookRejection\("CAPABILITY_FORBIDDEN"/u);
  assert.match(source, /kakaoAssistantCapabilityForbiddenResponse/u);
});
