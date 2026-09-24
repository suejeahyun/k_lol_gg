import assert from "node:assert/strict";
import test from "node:test";

import nextConfig from "../next.config";

test("every document permits the privacy-enhanced YouTube player across client navigation while retaining other CSP boundaries", async () => {
  const rules = await nextConfig.headers!();
  const documentRule = rules.find((rule) => rule.source === "/:path*");
  assert.ok(documentRule);
  const headers = new Headers(documentRule.headers.map<[string, string]>(({ key, value }) => [key, value]));
  const policy = new Map(headers.get("Content-Security-Policy")!.split(";").map((directive) => {
    const [name, ...sources] = directive.trim().split(/\s+/u);
    return [name, sources];
  }));
  assert.deepEqual(policy.get("frame-src"), ["'self'", "https://www.youtube-nocookie.com"]);
  assert.deepEqual(policy.get("default-src"), ["'self'"]);
  assert.deepEqual(policy.get("frame-ancestors"), ["'none'"]);
  assert.deepEqual(policy.get("object-src"), ["'none'"]);
  assert.ok(!policy.get("script-src")!.some((source) => source.startsWith("https:")));
  assert.equal(headers.get("X-Frame-Options"), "DENY");
  assert.equal(headers.get("Referrer-Policy"), "no-referrer");
});
