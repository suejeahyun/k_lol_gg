import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");

const routes = {
  PUBLIC_KAKAO_ROOM_COMMAND: ["recruits", "operation-forms", "openchat", "search-player"],
  TRUSTED_KAKAO_SENDER_COMMAND: ["season-applications", "managed-forms", "scheduled-notice", "image-receive"],
};

test("Kakao route capability policy is explicit for every phone endpoint", async () => {
  for (const [capability, names] of Object.entries(routes)) {
    for (const name of names) {
      const source = await readFile(resolve(root, `src/app/api/integrations/kakao/${name}/route.ts`), "utf8");
      assert.match(source, new RegExp(`(?:prepareKakaoSignedJson|verifyKakaoHttpRequest)\\([^;]+${capability}\\)`), `${name} must explicitly require ${capability}`);
    }
  }
});
