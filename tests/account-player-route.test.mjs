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
