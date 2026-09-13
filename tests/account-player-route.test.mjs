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
  const styles = await readFile(new URL("../src/components/accounts/account-access.module.css", import.meta.url), "utf8");
  const page = await readFile(new URL("../src/app/(public)/account/page.tsx", import.meta.url), "utf8");
  assert.match(form, /useRef/);
  assert.match(form, /fingerprint/);
  assert.match(form, /idempotency\.current = null/);
  assert.match(form, /기존 Riot 전적 연동이 자동 해제/);
  assert.match(form, /response\.status === 412/);
  assert.match(form, /router\.refresh\(\)/);
  assert.match(form, /maxLength=\{22\}/);
  assert.match(form, /aria-describedby="account-player-riot-id-help account-player-riot-id-warning"/);
  assert.match(form, /<AccountTierField label="현재 티어" name="currentTier"/);
  assert.match(form, /<AccountTierField label="최고 티어" name="peakTier"/);
  assert.match(form, /playerTierFilters\.map/);
  assert.match(form, /data-tier-division=\{name\}/);
  assert.match(form, /playerDivisionRankOptions\.map/);
  assert.match(form, /data-tier-score=\{name\}/);
  assert.match(form, /min=\{0\}/);
  assert.match(form, /max=\{9999\}/);
  assert.match(form, /required/);
  assert.match(form, /아이언부터 챌린저까지 티어를 선택/);
  assert.match(form, /다이아몬드 이하는 단계를 선택/);
  assert.match(styles, /\.tierControls \{ display: grid; grid-template-columns:/);
  assert.match(styles, /@media \(max-width: 520px\)/);
  assert.match(styles, /\.promise, \.facts, \.playerTierGrid, \.activityGrid, \.accountGrid \{ grid-template-columns: 1fr; \}/);
  assert.match(page, /<AccountPlayerForm key=\{account\.player\.revision\} player=\{account\.player\} \/>/);
});

test("account pages reuse the account shell and avoid decorative English headings", async () => {
  const [shell, overview, riot, discipline, password] = await Promise.all([
    readFile(new URL("../src/components/accounts/account-shell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/(public)/account/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/(public)/account/riot/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/(public)/account/discipline/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/(public)/account/password/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(shell, /> 내 계정</);
  assert.match(overview, /<AccountShell activeTab=/);
  assert.match(riot, /<AccountShell activeTab="riot"/);
  assert.match(discipline, /내 경고 해소 과제/);
  assert.match(password, /비밀번호 보안/);
  assert.doesNotMatch(`${shell}\n${overview}\n${discipline}\n${password}`, /MY ACCOUNT|MY PLAYER|MY ACTIVITY|SAFETY STATUS|MY DISCIPLINE TASKS|PASSWORD SECURITY/);
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
