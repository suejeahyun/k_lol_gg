import assert from "node:assert/strict";
import test from "node:test";
import { resolveHubRoute } from "../src/lib/hub-route-policy";

test("HUB development loads Next bracketed chunks without opening encoded application paths", () => {
  for (const path of ["/_next/static/chunks/%5Bturbopack%5D_runtime.js", "/_next/static/chunks/app/(public)/sites/%5bsiteId%5d/page.js"]) {
    assert.equal(resolveHubRoute(path, "GET", true).kind, "allow");
    assert.equal(resolveHubRoute(path, "HEAD", true).kind, "allow");
    assert.equal(resolveHubRoute(path, "POST", true).kind, "method-not-allowed");
    assert.equal(resolveHubRoute(path, "GET", false).kind, "not-found");
  }
  for (const path of ["/_next/static/%2e%2e/secret", "/_next/static/%5Bfoo%5D%2f..%2fsecret", "/_next/static/%255Bfoo%255D.js", "/_next/static/../secret", "/_next/static/%5Csecret", "/_next/static/%00.js", "/sites/%5Bid%5D", "/api/admin/%5Busers%5D"]) {
    assert.equal(resolveHubRoute(path, "GET", true).kind, "not-found", path);
  }
});
