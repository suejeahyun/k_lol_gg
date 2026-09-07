import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeAccountNext,
  normalizeInternalNext,
} from "../src/modules/auth/application/normalize-internal-next";
import {
  LoginAttemptLimiter,
  LoginWorkGate,
} from "../src/modules/auth/application/login-attempt-limiter";
import {
  hasSameOrigin,
  readTextBodyWithinLimit,
} from "../src/modules/auth/application/mutation-request-guard";
import { resolveRateLimitClientKey } from "../src/modules/auth/infrastructure/rate-limit-client-key";

test("safe next accepts only normalized same-origin paths", () => {
  assert.equal(normalizeInternalNext("/admin/players?status=pending#top"), "/admin/players?status=pending#top");
  assert.equal(normalizeInternalNext(["/admin/players", "/ignored"]), "/admin");
  assert.equal(normalizeInternalNext("https://evil.example"), "/admin");
  assert.equal(normalizeInternalNext("//evil.example"), "/admin");
  assert.equal(normalizeInternalNext("/\\evil.example"), "/admin");
  assert.equal(normalizeInternalNext("/%5C%5Cevil.example"), "/admin");
  assert.equal(normalizeInternalNext("/admin\u0000evil"), "/admin");
  assert.equal(normalizeInternalNext("/admin\u061cevil"), "/admin");
  assert.equal(normalizeInternalNext("/admin?note=%E2%80%8Ehidden"), "/admin");
  assert.equal(normalizeInternalNext("/admin?note=%C2%85hidden"), "/admin");
});

test("account next rejects ambiguity, browser normalization tricks, and administrator paths", () => {
  assert.equal(normalizeAccountNext("/players?mine=1"), "/players?mine=1");
  assert.equal(normalizeAccountNext(["/players", "/account"]), "/account");
  assert.equal(normalizeAccountNext("/admin"), "/account");
  assert.equal(normalizeAccountNext("/admin/users"), "/account");
  assert.equal(normalizeAccountNext("/%61dmin/users"), "/account");
  assert.equal(normalizeAccountNext("/\\evil.example"), "/account");
  assert.equal(normalizeAccountNext("/%5c%5cevil.example"), "/account");
  assert.equal(normalizeAccountNext("/%2f%2fevil.example"), "/account");
  assert.equal(normalizeAccountNext("https://evil.example"), "/account");
  assert.equal(normalizeAccountNext("//evil.example"), "/account");
  assert.equal(normalizeAccountNext(`/account?x=${"a".repeat(2_048)}`), "/account");
  assert.equal(normalizeAccountNext("/account%00evil"), "/account");
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

test("rate-limit IP keys trust only Vercel's anti-spoofing header on Vercel", () => {
  const spoofedHeaders = new Headers({
    "x-forwarded-for": "198.51.100.7",
    "x-real-ip": "198.51.100.8",
    "x-vercel-forwarded-for": "203.0.113.9",
  });
  assert.equal(
    resolveRateLimitClientKey(spoofedHeaders, {}),
    "shared-untrusted-proxy",
  );
  assert.equal(
    resolveRateLimitClientKey(spoofedHeaders, { VERCEL: "1" }),
    "203.0.113.9",
  );
  assert.equal(
    resolveRateLimitClientKey(
      new Headers({ "x-vercel-forwarded-for": "2001:db8::7" }),
      { VERCEL: "1" },
    ),
    "2001:db8::7",
  );
  assert.equal(
    resolveRateLimitClientKey(
      new Headers({ "x-forwarded-for": "203.0.113.10" }),
      { VERCEL: "1" },
    ),
    "unknown-vercel-client",
  );
  assert.equal(
    resolveRateLimitClientKey(
      new Headers({ "x-vercel-forwarded-for": "not-an-ip" }),
      { VERCEL: "1" },
    ),
    "unknown-vercel-client",
  );
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
  for (const malformedOrigin of [
    "http://127.0.0.1:3300/path",
    "http://127.0.0.1:3300?query=1",
    "http://127.0.0.1:3300#fragment",
  ]) {
    assert.equal(hasSameOrigin(new Request("http://127.0.0.1:3300/api/admin/logout", {
      headers: { origin: malformedOrigin },
    })), false);
  }
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
