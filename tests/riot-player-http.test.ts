import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { isPublicRiotPlayerId } from "../src/modules/riot/application/riot-query";
import { parseRiotAnalyticsCursor, RIOT_MATCH_ID_PATTERN } from "../src/modules/riot/domain/riot-match-normalizer";

const playerId = "4a3296cd-8c80-46ec-9010-123456789abc";
type Result = { state: string; data?: unknown };

function route(kind: "analytics" | "match", result: Result = { state: "ready", data: null }) {
  const file = kind === "analytics" ? "analytics" : "matches/[matchId]";
  const source = readFileSync(new URL(`../src/app/api/riot/player/[playerId]/${file}/route.ts`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const calls: unknown[][] = [];
  const read = async (...args: unknown[]) => { calls.push(args); return result; };
  const response = (status: number, data: unknown = {}) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
  const modules: Record<string, unknown> = {
    "@/modules/riot/application/riot-query": { isPublicRiotPlayerId },
    "@/modules/riot/domain/riot-match-normalizer": { parseRiotAnalyticsCursor, RIOT_MATCH_ID_PATTERN },
    "@/modules/riot/infrastructure/runtime-riot": { loadRuntimePublicRiotAnalytics: read, loadRuntimePublicRiotMatch: read },
    "@/modules/riot/infrastructure/riot-http": {
      riotInvalidInputResponse: () => response(400), riotNotFoundResponse: () => response(404),
      riotUnavailableResponse: () => response(503), riotReadResponse: (data: unknown) => response(200, data),
    },
    "@/platform/http": { readValidatedTraceId: () => undefined },
  };
  const exports: { GET?: (request: Request, context: { params: Promise<{ playerId: string; matchId: string }> }) => Promise<Response> } = {};
  vm.runInNewContext(compiled, { exports, URL, require: (id: string) => {
    assert.ok(Object.hasOwn(modules, id), `Unexpected route dependency: ${id}`);
    return modules[id];
  } });
  return { calls, get: (query = "", id = playerId, matchId = "KR_1234567890") => exports.GET!(new Request(`https://example.test/read${query}`), { params: Promise.resolve({ playerId: id, matchId }) }) };
}

test("public analytics rejects invalid IDs, ambiguous and malformed cursors before storage access", async () => {
  const subject = route("analytics");
  for (const query of ["?owner=someone", "?cursor=a&cursor=b", "?cursor=", "?cursor=not-a-cursor"]) {
    assert.equal((await subject.get(query)).status, 400);
  }
  assert.equal((await subject.get("", "invalid-id")).status, 400);
  assert.equal(subject.calls.length, 0);
});

test("public match rejects extraneous queries and unsafe identifiers before storage access", async () => {
  const subject = route("match");
  assert.equal((await subject.get("?include=private")).status, 400);
  assert.equal((await subject.get("", playerId, "../private")).status, 400);
  assert.equal((await subject.get("", "invalid-id")).status, 400);
  assert.equal(subject.calls.length, 0);
});

test("public analytics and match distinguish unavailable, hidden and stored public data", async () => {
  for (const kind of ["analytics", "match"] as const) {
    assert.equal((await route(kind, { state: "unavailable" }).get()).status, 503);
    assert.equal((await route(kind).get()).status, 404);
    const data = { matches: [], updatedAt: "2026-09-25T00:00:00.000Z" };
    const subject = route(kind, { state: "ready", data });
    const response = await subject.get();
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { state: "ready", data });
    assert.equal(subject.calls.length, 1);
    assert.equal(subject.calls[0][0], playerId);
  }
});
