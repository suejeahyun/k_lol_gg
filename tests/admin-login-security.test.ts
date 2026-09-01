import assert from "node:assert/strict";
import test from "node:test";
import { normalizeInternalNext } from "../src/modules/auth/application/normalize-internal-next";
import {
  LoginAttemptLimiter,
  LoginWorkGate,
} from "../src/modules/auth/application/login-attempt-limiter";
import {
  hasSameOrigin,
  readTextBodyWithinLimit,
} from "../src/modules/auth/application/mutation-request-guard";

test("safe next accepts only normalized same-origin paths", () => {
  assert.equal(normalizeInternalNext("/admin/players?status=pending#top"), "/admin/players?status=pending#top");
  assert.equal(normalizeInternalNext(["/admin", "/ignored"]), "/admin");
  assert.equal(normalizeInternalNext("https://evil.example"), "/admin");
  assert.equal(normalizeInternalNext("//evil.example"), "/admin");
  assert.equal(normalizeInternalNext("/\\evil.example"), "/admin");
  assert.equal(normalizeInternalNext("/%5C%5Cevil.example"), "/admin");
  assert.equal(normalizeInternalNext("/admin\u0000evil"), "/admin");
});

test("login limiter caps attempts by normalized login and resets after its window", () => {
  let now = 1_000;
  const limiter = new LoginAttemptLimiter(() => now);

  for (let count = 0; count < 8; count += 1) {
    assert.deepEqual(limiter.consume(`client-${count}`, " E2E_ADMIN "), { allowed: true });
  }
  const blocked = limiter.consume("another-client", "e2e_admin");
  assert.equal(blocked.allowed, false);

  now += 5 * 60_000 + 1;
  assert.deepEqual(limiter.consume("another-client", "e2e_admin"), { allowed: true });
});

test("login work gate releases capacity exactly once", () => {
  const gate = new LoginWorkGate(1);
  const release = gate.acquire();
  assert.equal(typeof release, "function");
  assert.equal(gate.acquire(), null);
  release?.();
  release?.();
  assert.equal(typeof gate.acquire(), "function");
});

test("mutation guard requires an exact same origin", () => {
  const sameOrigin = new Request("http://127.0.0.1:3300/api/admin/logout", {
    headers: { origin: "http://127.0.0.1:3300" },
  });
  const differentHost = new Request("http://127.0.0.1:3300/api/admin/logout", {
    headers: { origin: "http://localhost:3300" },
  });

  assert.equal(hasSameOrigin(sameOrigin), true);
  assert.equal(hasSameOrigin(differentHost), false);
  assert.equal(hasSameOrigin(sameOrigin, "https://v2.example.test"), false);
});

test("body guard stops reading after the byte limit", async () => {
  const small = await readTextBodyWithinLimit(new Request("https://v2.example.test", {
    method: "POST",
    body: "한글 JSON",
  }), 32);
  const large = await readTextBodyWithinLimit(new Request("https://v2.example.test", {
    method: "POST",
    body: "x".repeat(2_049),
  }), 2_048);

  assert.deepEqual(small, { ok: true, text: "한글 JSON" });
  assert.deepEqual(large, { ok: false, reason: "TOO_LARGE" });
});
