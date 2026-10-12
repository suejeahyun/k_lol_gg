import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

test("fixed static URLs refresh online and use cached data offline; hashed assets stay immutable", async () => {
  const source = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
  const handlers = new Map(), stored = new Map();
  let online = true, fetches = 0;
  const response = (body) => ({ body, ok: true, type: "basic", clone() { return response(body); } });
  const cache = { async match(request) { return stored.get(request.url); }, async put(request, value) { stored.set(request.url, value); }, async delete(request) { stored.delete(request.url); } };
  vm.runInNewContext(source, { URL, AbortSignal, self: { location: { origin: "https://site.example" }, addEventListener(name, fn) { handlers.set(name, fn); } },
    caches: { async open() { return cache; } }, async fetch(request, options) { fetches++; if (!online) throw new Error("offline"); assert.ok(options.signal); return response("fresh"); } });
  const read = async (path) => {
    let pending;
    handlers.get("fetch")({ request: { method: "GET", url: `https://site.example${path}` }, respondWith(value) { pending = value; } });
    return pending;
  };
  stored.set("https://site.example/images/home/test.webp", response("old"));
  assert.equal((await read("/images/home/test.webp")).body, "fresh");
  online = false;
  assert.equal((await read("/images/home/test.webp")).body, "fresh");
  const before = fetches;
  stored.set("https://site.example/_next/static/hash.js", response("immutable"));
  assert.equal((await read("/_next/static/hash.js")).body, "immutable");
  assert.equal(fetches, before);
  assert.equal(await read("/api/auth/me"), undefined);
});

test("cache storage failures never discard network assets or conceal their removal", async () => {
  const source = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
  for (const scenario of [
    { failure: "put", path: "/_next/static/new-build.js", status: 200, cached: false },
    { failure: "put", path: "/images/home/replaced.webp", status: 200, cached: true },
    { failure: "delete", path: "/images/home/removed.webp", status: 404, cached: true },
    { failure: "delete", path: "/images/home/removed.webp", status: 410, cached: true },
    { failure: "open", path: "/_next/static/new-build.js", status: 200, cached: false },
    { failure: "match", path: "/images/home/replaced.webp", status: 200, cached: false },
  ]) {
    const handlers = new Map();
    let fetches = 0, attemptedFailure = false;
    const network = { status: scenario.status, ok: scenario.status === 200, type: "basic", clone() { return this; } };
    const stale = { status: 200, body: "stale cached asset" };
    const fail = (operation) => {
      if (scenario.failure === operation) { attemptedFailure = true; throw new Error("QuotaExceededError"); }
    };
    const cache = {
      async match() { fail("match"); return scenario.cached ? stale : undefined; },
      async put() { fail("put"); },
      async delete() { fail("delete"); },
    };
    vm.runInNewContext(source, { URL, AbortSignal,
      self: { location: { origin: "https://site.example" }, addEventListener(name, handler) { handlers.set(name, handler); } },
      caches: { async open() { fail("open"); return cache; } },
      async fetch() { fetches++; return network; },
    });
    let pending;
    handlers.get("fetch")({ request: { method: "GET", url: `https://site.example${scenario.path}` }, respondWith(value) { pending = value; } });
    assert.equal(await pending, network, `${scenario.failure}/${scenario.status}: deliver the real network result`);
    assert.equal(fetches, 1);
    assert.equal(attemptedFailure, true, "the regression must exercise the failing storage operation");
  }
});
