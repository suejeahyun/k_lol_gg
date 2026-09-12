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
  assert.match(form, /useRef/);
  assert.match(form, /fingerprint/);
  assert.match(form, /idempotency\.current = null/);
  assert.match(form, /기존 Riot 전적 연동이 자동 해제/);
  assert.match(form, /response\.status === 412/);
  assert.match(form, /router\.refresh\(\)/);
  assert.match(form, /maxLength=\{22\}/);
  assert.match(form, /aria-describedby="account-player-riot-id-help account-player-riot-id-warning"/);
});
