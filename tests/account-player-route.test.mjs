import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("own player mutation keeps approval, origin, revision and idempotency guards", async () => {
  const route = await readFile(new URL("../src/app/api/auth/me/player/route.ts", import.meta.url), "utf8");
  assert.match(route, /export async function PATCH/);
  assert.match(route, /authorizeAccountApi/);
  assert.match(route, /guardAccountMutationOrigin/);
  assert.match(route, /readIfMatchRevision/);
  assert.match(route, /buildAccountMutationCommand/);
  assert.match(route, /updateOwnPlayer/);
});

test("own player form keeps one idempotency key for an uncertain retry and explains Riot relinking", async () => {
  const form = await readFile(new URL("../src/components/accounts/account-player-form.tsx", import.meta.url), "utf8");
  const page = await readFile(new URL("../src/app/(public)/account/page.tsx", import.meta.url), "utf8");
  assert.match(form, /useRef/);
  assert.match(form, /fingerprint/);
  assert.match(form, /idempotency\.current = null/);
  assert.match(form, /기존 Riot 전적 연동이 자동 해제/);
  assert.match(form, /response\.status === 412/);
  assert.match(form, /router\.refresh\(\)/);
  assert.match(form, /maxLength=\{22\}/);
  assert.match(form, /aria-describedby="account-player-riot-id-help account-player-riot-id-warning"/);
  assert.match(page, /<AccountPlayerForm key=\{account\.player\.revision\} player=\{account\.player\} \/>/);
});

test("isolated account HTTP verification runs the real Chromium owner profile regression", async () => {
  const browser = await readFile(new URL("../scripts/test-db/verify-player-profile-browser.ts", import.meta.url), "utf8");
  const accountHttp = await readFile(new URL("../scripts/test-db/verify-account-http.ts", import.meta.url), "utf8");
  assert.match(browser, /IsolatedChromium\.launch/);
  assert.match(browser, /\/account\?tab=player/);
  assert.match(browser, /replaceFieldWithKeyboard/);
  assert.match(browser, /pressEnter/);
  assert.match(browser, /waitForResponse\("\/api\/auth\/me\/player", 200\)/);
  assert.match(browser, /waitForResponse\("\/api\/auth\/me\/player", 412\)/);
  assert.match(browser, /browserQaInstance = 'before-412'/);
  assert.match(browser, /the stale browser submission must not overwrite/);
  assert.match(accountHttp, /runPlayerProfileBrowserRegression\(origin, selfProfileLogin\.cookie\)/);
});
