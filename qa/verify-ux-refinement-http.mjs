import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const origin = process.argv[2] ?? JSON.parse(await readFile(".tmp/ux-qa/result.json", "utf8")).origin;
const output = process.argv[3] ?? "docs/qa-evidence/ux-refinement-v1.0.0-2026-10-03/local-http.json";
const pages = [
  ["/", ["home-join-actions", "참가 가능한 파티", "home-ranking-title"]],
  ["/login", ["login-title", "autocomplete=\"username\""]],
  ["/signup", ["signup-title"]],
  ["/matches", ["상세 필터", "match-list-title"]],
  ["/matches?winner=BLUE&from=2026-09-01&order=asc", ["3개 적용", "검색 조건 초기화"]],
  ["/matches?q=NoMatchingFixture20261003", ["조건에 맞는 공개 경기가 없어요", "전체 경기 보기"]],
  ["/recruits", ["recruit-title"]],
  ["/help/recruits", ["find-room", "모집방을 모르겠어요"]],
  ["/tools/team-balance", ["team-balance-title", "회원가입 후 팀 만들기"]],
  ["/tools/random-team", ["random-team-title", "진영 정하기"]],
  ["/tools/coin-toss", ["coin-toss-title", "무작위 팀 나누기"]],
  ["/matches?q=&sort=playedOn&seasonId=&winner=BLUE&from=2026-09-01&to=&order=desc&pageSize=12", ["2개 적용", "검색 조건 초기화"]],
  ["/matches?q=&sort=playedOn&seasonId=&winner=&from=&to=&order=desc&pageSize=12", ["상세 필터", "match-list-title"]],
  ["/api/health", []],
];
const results = [];
for (const [path, expected] of pages) {
  const response = await fetch(new URL(path, origin));
  const body = await response.text();
  assert.equal(response.status, 200, path);
  for (const text of expected) assert.ok(body.toLowerCase().includes(text.toLowerCase()), `${path}: ${text}`);
  if (path === "/matches") assert.match(body, /<details[^>]*><summary>상세 필터/, "default filters are collapsed");
  if (path.startsWith("/matches?winner")) assert.match(body, /<details[^>]*open=""/, "active filters stay visible");
  results.push({ path, status: response.status, assertions: expected.length });
}
const asset = JSON.parse(await readFile("docs/design/image-theme-controls-v2.json", "utf8")).assets[0];
const response = await fetch(new URL(asset.path.replace(/^public/, ""), origin));
const bytes = Buffer.from(await response.arrayBuffer());
assert.equal(response.status, 200);
assert.match(response.headers.get("content-type"), /image\/webp/);
assert.equal(createHash("sha256").update(bytes).digest("hex"), asset.sha256);
await writeFile(output, JSON.stringify({ origin, checkedAt: new Date().toISOString(), results, image: { path: asset.path, bytes: bytes.length, sha256: asset.sha256 }, passed: true }, null, 2) + "\n");
console.log(`PASS: ${results.length} HTTP routes, generated controls image MIME and SHA-256`);
