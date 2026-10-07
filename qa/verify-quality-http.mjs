import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { buildCapturePlan, discoverAppPages } from "../scripts/build-page-capture-plan.mjs";

// This audit can authenticate only against the isolated harness, never production.
const fixture = JSON.parse((await readFile(process.argv[2] ?? ".tmp/quality-browser-ready.json", "utf8")).replace(/^\uFEFF/, ""));
const origin = new URL(fixture.origin);
assert.equal(origin.hostname, "127.0.0.1");
assert.equal(origin.protocol, "http:");
const cookies = {};
for (const [session, path, loginId] of [
  ["account", "/api/auth/login", fixture.accountLoginId],
  ["admin", "/api/admin/login", fixture.loginId],
  ["setup", "/api/admin/login", fixture.setupLoginId],
]) {
  const response = await fetch(new URL(path, origin), {
    method: "POST", headers: { origin: origin.origin, "content-type": "application/json" },
    body: JSON.stringify({ loginId, password: fixture.password }),
  });
  assert.equal(response.status, 200, `${session} fixture login`);
  cookies[session] = response.headers.getSetCookie().map(value => value.split(";", 1)[0]).join("; ");
}
const pages = await discoverAppPages("src/app");
const plan = buildCapturePlan(pages, fixture.fixtures);
const targets = [...new Map(plan.map(entry => [`${entry.session}:${entry.path}`, entry])).values()];
for (const path of ["/competitions/events", "/competitions/destruction"]) {
  const source = targets.find(entry => entry.path === path);
  assert.ok(source);
  for (const query of ["q=&status=&format=", "q=&status=RECRUITING&format=", "status=UNKNOWN"]) {
    targets.push({ ...source, path: path + "?" + query, rejectText: query === "status=UNKNOWN" ? undefined : "목록 주소를 확인해 주세요." });
  }
}
targets.push({ ...targets.find(entry => entry.path === "/matches/submissions"), path: "/matches/submissions?status=", rejectText: "목록 조건이 올바르지 않아요." });
for (const path of ["/admin/highlights", "/admin/images"]) {
  const source = targets.find(entry => entry.path === path);
  assert.ok(source);
  for (const query of ["pageSize=1", "page=2&pageSize=1", "status=&pageSize=1", "status=PUBLISHED&pageSize=1", "page=0"]) {
    targets.push({ ...source, path: `${path}?${query}`, rejectText: query === "page=0" ? undefined : "목록 조건을 확인해 주세요.", requireText: query === "page=0" ? "목록 초기화" : undefined });
  }
}
const rows = [];
for (const entry of targets) {
  let target = new URL(entry.path, origin);
  let response;
  const redirects = [];
  const start = performance.now();
  for (let hop = 0; hop < 8; hop++) {
    assert.equal(target.origin, origin.origin, "Never forward test credentials outside the fixture");
    response = await fetch(target, { redirect: "manual", headers: cookies[entry.session] ? { cookie: cookies[entry.session] } : {} });
    if (response.status < 300 || response.status >= 400) break;
    redirects.push({ status: response.status, destination: response.headers.get("location") });
    target = new URL(response.headers.get("location"), target);
  }
  const html = await response.text();
  const issues = [];
  if (response.status !== 200) issues.push(`HTTP_${response.status}`);
  if (/Application error:|Internal Server Error/.test(html)) issues.push("SERVER_ERROR");
  if (entry.rejectText && html.includes(entry.rejectText)) issues.push("VALID_FILTER_REJECTED");
  if (entry.requireText && !html.includes(entry.requireText)) issues.push("MISSING_RECOVERY_CONTROL");
  if (!/<h1(?:\s|>)/.test(html)) issues.push("MISSING_H1");
  if (entry.session !== "anonymous" && target.pathname === "/admin/login") issues.push("UNEXPECTED_LOGIN");
  if (entry.expectedRedirect && redirects[0]?.status !== entry.expectedRedirect.status) issues.push("REDIRECT_STATUS");
  rows.push({ route: entry.routeTemplate, path: entry.path, session: entry.session, status: response.status, finalPath: target.pathname + target.search, redirects, responseMs: Math.round(performance.now() - start), htmlBytes: Buffer.byteLength(html), issues });
}
const result = { checkedAt: new Date().toISOString(), origin: origin.origin, pageCount: pages.length, targetCount: rows.length, missingFixtures: 0, passed: rows.every(row => !row.issues.length), rows };
await writeFile(process.argv[3] ?? ".tmp/quality-http.json", JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({ pages: result.pageCount, targets: rows.length, failures: rows.filter(row => row.issues.length) }, null, 2));
assert.ok(result.passed, "Every resolved page and query variant must pass");
