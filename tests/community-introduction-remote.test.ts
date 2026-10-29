import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Script } from "node:vm";
import ts from "typescript";
import * as policy from "../src/modules/community-network/domain/community-introduction-remote-policy";
import * as dto from "../src/modules/operations/domain/community-introduction";
import { fetchPublicCommunityIntroduction } from "../src/modules/community-network/infrastructure/public-community-introduction-client";

const origin = "https://community.example.com";
const publicAddress = { address: "76.76.21.21", family: 4 as const };
const profile = { summary: "같이 게임하는 커뮤니티", introduction: "내전과 친선전을 운영합니다.", activities: "내전", activityHours: "저녁", joiningInfo: "가입 신청 후 승인", contactUrl: "https://open.kakao.com/example", bannerUrl: null };
const introduction = { version: 1 as const, origin, profile, updatedAt: "2026-10-29T00:00:00.000Z" };
const response = (body: unknown = introduction, status = 200) => ({ status, contentType: "application/json; charset=utf-8", contentEncoding: "identity", body: Buffer.from(JSON.stringify(body)) });
const resolved = async () => [publicAddress];

test("introduction origins permit canonical public DNS HTTPS including custom domains only", () => {
  for (const value of [origin, "https://nexus-gg-kr.vercel.app", "https://xn--9n3b19m.com"]) assert.equal(policy.introductionOrigin(value)?.origin, value);
  for (const value of ["http://example.com", "https://example.com:443", "https://example.com:8443", "https://user:pass@example.com", "https://example.com/", "https://example.com/api", "https://example.com?x=1", "https://example.com#x", "https://EXAMPLE.com", "https://127.0.0.1", "https://2130706433", "https://0x7f000001", "https://[::1]", "https://[2606:4700:4700::1111]", "https://localhost", "https://a.localhost", "https://a.local", "https://a.internal", "https://a.invalid", "https://a.test", "https://example.com.", "https://_service.example.com", "https://example.com\\@127.0.0.1"]) assert.equal(policy.introductionOrigin(value), null, value);
});

test("all IPv4 private, reserved, documentation, multicast and metadata destinations fail closed", () => {
  for (const address of ["0.0.0.0", "0.255.255.255", "10.0.0.1", "10.255.255.255", "100.64.0.0", "100.127.255.255", "127.0.0.1", "127.255.255.255", "169.254.0.0", "169.254.169.254", "172.16.0.0", "172.31.255.255", "192.0.0.1", "192.0.0.9", "192.0.2.255", "192.88.99.1", "192.168.255.255", "198.18.0.0", "198.19.255.255", "198.51.100.1", "203.0.113.1", "224.0.0.1", "239.255.255.255", "240.0.0.1", "255.255.255.255", "168.63.129.16", "127.1", "0177.0.0.1", "0x7f000001", "8.8.8.8%eth0", "999.1.1.1"]) assert.equal(policy.isPublicIntroductionAddress(address), false, address);
  for (const address of ["1.1.1.1", "8.8.8.8", "76.76.21.21", "100.63.255.255", "100.128.0.0", "172.15.255.255", "172.32.0.0", "198.17.255.255", "198.20.0.0", "223.255.255.255"]) assert.equal(policy.isPublicIntroductionAddress(address), true, address);
});

test("IPv6 rejects mapped IPv4, NAT64, Teredo, 6to4, ISATAP and every non-global scope", () => {
  for (const address of ["::", "::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:0:7f00:1", "::7f00:1", "64:ff9b::7f00:1", "64:ff9b:1::a00:1", "100::1", "100:0:0:1::1", "2001::1", "2001:1ff:ffff::1", "2001:2::1", "2001:20::1", "2001:db8::1", "2002:7f00:1::", "2002:0808:0808::1", "2606:4700::5efe:7f00:1", "2606:4700:0:0:0200:5efe:a00:1", "3fff::1", "3fff:ffff::1", "5f00::1", "fc00::1", "fdff::1", "fe80::1", "fe80::1%eth0", "fec0::1", "ff02::1", "2001:4860:::1", "2001:4860::1.2.3.4"]) assert.equal(policy.isPublicIntroductionAddress(address), false, address);
  for (const address of ["2606:4700:4700::1111", "2001:4860:4860::8888", "2001:470::1", "2a00:1450:4001:82f::200e", "2606:4700:4700:0000:0000:0000:0000:1111", "2606:4700:4700::ABCD"]) assert.equal(policy.isPublicIntroductionAddress(address), true, address);
});

test("DNS selection rejects any unsafe answer or family mismatch and pins one validated address", () => {
  const v6 = { address: "2606:4700:4700::1111", family: 6 };
  assert.deepEqual(policy.selectIntroductionAddress([v6, publicAddress]), publicAddress);
  assert.deepEqual(policy.selectIntroductionAddress([v6]), v6);
  for (const records of [[], [publicAddress, { address: "10.0.0.1", family: 4 }], [publicAddress, { address: "::ffff:7f00:1", family: 6 }], [{ ...publicAddress, family: 6 }], [{ address: "invalid", family: 0 }], Array(33).fill(publicAddress)]) assert.equal(policy.selectIntroductionAddress(records), null);
});

test("remote reads validate exact origin and fresh DTO without caching or accepting credentials", async () => {
  let resolves = 0, requests = 0;
  const result = await fetchPublicCommunityIntroduction(origin, {
    resolve: async (hostname) => { assert.equal(hostname, "community.example.com"); resolves++; return [publicAddress]; },
    request: async (url, address, signal) => { requests++; assert.equal(url.origin, origin); assert.equal(url.pathname, "/"); assert.deepEqual(address, publicAddress); assert.equal(signal.aborted, false); return response(); },
  });
  assert.deepEqual(result, { state: "ready", data: introduction }); assert.equal(resolves, 1); assert.equal(requests, 1);
  assert.deepEqual(await fetchPublicCommunityIntroduction(origin, { resolve: resolved, request: async () => response({}, 404) }), { state: "unpublished" });
  for (const invalid of [{ ...introduction, origin: "https://other.example.com" }, { ...introduction, version: 2 }, { ...introduction, privateMembers: [] }, { ...introduction, profile: { ...profile, published: true } }, { ...introduction, profile: { ...profile, summary: "" } }, { ...introduction, updatedAt: "yesterday" }]) assert.deepEqual(await fetchPublicCommunityIntroduction(origin, { resolve: resolved, request: async () => response(invalid) }), { state: "unsupported" });
});

test("redirects, HTML, encoded or oversized bodies and unavailable responses are bounded", async () => {
  for (const status of [301, 302, 307, 308, 501]) assert.deepEqual(await fetchPublicCommunityIntroduction(origin, { resolve: resolved, request: async () => response({}, status) }), { state: "unsupported" });
  for (const status of [401, 403, 429, 500, 503]) assert.deepEqual(await fetchPublicCommunityIntroduction(origin, { resolve: resolved, request: async () => response({}, status) }), { state: "unavailable" });
  for (const overrides of [{ contentType: "text/html" }, { contentEncoding: "gzip" }, { body: Buffer.from("<html>private error</html>") }, { body: Buffer.from([0xc0, 0x80]) }]) assert.deepEqual(await fetchPublicCommunityIntroduction(origin, { resolve: resolved, request: async () => ({ ...response(), ...overrides }) }), { state: "unsupported" });
  assert.deepEqual(await fetchPublicCommunityIntroduction(origin, { resolve: resolved, request: async () => ({ ...response(), body: Buffer.alloc(policy.COMMUNITY_INTRODUCTION_MAX_BYTES + 1) }) }), { state: "unavailable" });
});

test("unsafe resolution makes no connection and one deadline covers DNS and network", async () => {
  let requests = 0, resolves = 0;
  const request = async () => { requests++; return response(); };
  assert.deepEqual(await fetchPublicCommunityIntroduction("http://example.com", { resolve: async () => { resolves++; return [publicAddress]; }, request }), { state: "unsupported" });
  assert.equal(resolves, 0);
  assert.deepEqual(await fetchPublicCommunityIntroduction("https://127-0-0-1.nip.io", { resolve: async () => [{ address: "127.0.0.1", family: 4 }], request }), { state: "unavailable" });
  assert.deepEqual(await fetchPublicCommunityIntroduction(origin, { resolve: async () => [publicAddress, { address: "169.254.169.254", family: 4 }], request }), { state: "unavailable" });
  assert.deepEqual(await fetchPublicCommunityIntroduction(origin, { resolve: async () => { throw new Error("private DNS diagnostics"); }, request }), { state: "unavailable" });
  assert.deepEqual(await fetchPublicCommunityIntroduction(origin, { resolve: async () => new Promise(() => {}), request, timeoutMs: 5 }), { state: "unavailable" });
  assert.equal(requests, 0);
  let signal: AbortSignal | undefined;
  assert.deepEqual(await fetchPublicCommunityIntroduction(origin, { resolve: resolved, request: async (_url, _address, value) => { signal = value; return new Promise(() => {}); }, timeoutMs: 5 }), { state: "unavailable" });
  assert.equal(signal?.aborted, true);
});

function transportHarness(status: number, headers: Record<string, string>, chunks: Buffer[] = []) {
  let options: Record<string, unknown> = {}, requests = 0, destroyed = false;
  const response = Object.assign(new EventEmitter(), { statusCode: status, headers, destroy() { destroyed = true; } });
  const request = Object.assign(new EventEmitter(), { end() { queueMicrotask(() => { callback(response); if (!destroyed) { for (const chunk of chunks) { if (destroyed) break; response.emit("data", chunk); } if (!destroyed) response.emit("end"); } }); } });
  let callback: (response: EventEmitter) => void;
  let identityHost = "";
  const dependencies: Record<string, unknown> = {
    "node:dns/promises": { lookup: () => { throw new Error("second DNS lookup forbidden"); } },
    "node:https": { request: (value: Record<string, unknown>, listener: typeof callback) => { requests++; options = value; callback = listener; return request; } },
    "node:tls": { checkServerIdentity: (hostname: string) => { identityHost = hostname; return new Error("CERT_HOSTNAME_MISMATCH"); } },
    "@/modules/operations/domain/community-introduction": dto,
    "../domain/community-introduction-remote-policy": policy,
  };
  const output: { requestPinnedCommunityIntroduction?: (url: URL, address: policy.IntroductionAddress, signal: AbortSignal) => Promise<unknown> } = {};
  const code = ts.transpileModule(readFileSync(new URL("../src/modules/community-network/infrastructure/public-community-introduction-client.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Script(code).runInNewContext({ exports: output, Buffer, require: (key: string) => { assert.ok(Object.hasOwn(dependencies, key), key); return dependencies[key]; } });
  return { read: () => output.requestPinnedCommunityIntroduction!(new URL(origin), publicAddress, new AbortController().signal), options: () => options, requests: () => requests, destroyed: () => destroyed, identityHost: () => identityHost };
}

test("native HTTPS connects to the pinned IP with original Host and TLS verification, no session or proxy agent", async () => {
  const app = transportHarness(200, { "content-type": "application/json" }, [Buffer.from("{}")]);
  await app.read(); const options = app.options();
  assert.equal(options.hostname, publicAddress.address); assert.equal(options.servername, "community.example.com");
  assert.equal(options.path, "/api/community-introduction"); assert.equal(options.port, 443); assert.equal(options.method, "GET"); assert.equal(options.agent, false); assert.equal(options.rejectUnauthorized, true); assert.equal(options.maxHeaderSize, 8192);
  assert.deepEqual(JSON.parse(JSON.stringify(options.headers)), { Host: "community.example.com", Accept: "application/json", "Accept-Encoding": "identity", "Cache-Control": "no-cache", Pragma: "no-cache" });
  const verify = options.checkServerIdentity as (hostname: string, certificate: object) => Error;
  assert.equal(verify("76.76.21.21", {}).message, "CERT_HOSTNAME_MISMATCH"); assert.equal(app.identityHost(), "community.example.com"); assert.equal(app.requests(), 1);
});

test("native transport never follows Location and destroys large declared or chunked bodies", async () => {
  const redirect = transportHarness(302, { location: "http://169.254.169.254/latest/meta-data" });
  assert.equal((await redirect.read() as { status: number }).status, 302); assert.equal(redirect.requests(), 1); assert.equal(redirect.destroyed(), true);
  for (const app of [transportHarness(200, { "content-length": "32769" }), transportHarness(200, {}, [Buffer.alloc(16384), Buffer.alloc(16385)])]) {
    await assert.rejects(app.read(), /INTRODUCTION_TOO_LARGE/); assert.equal(app.destroyed(), true); assert.equal(app.requests(), 1);
  }
});
