import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

import { authorizeSession } from "../src/modules/auth/application/authorize-session";
import type { AuthRole, AuthSession } from "../src/modules/auth/domain/auth-session";
import * as queryModule from "../src/modules/team-tools/application/team-score-query";
import { TeamBalanceServiceError } from "../src/modules/team-tools/domain/team-balance-draft";
import * as teamBalanceHttp from "../src/modules/team-tools/infrastructure/team-balance-http";
import * as http from "../src/platform/http";

const playerId = "33333333-3333-4333-8333-333333333333";
const origin = "https://v2.example/api/admin/balance-ai/team-scores";
const admin: AuthSession = {
  sessionId: "11111111-1111-4111-8111-111111111111", userId: "22222222-2222-4222-8222-222222222222",
  role: "ADMIN", purpose: "ADMIN", accountStatus: "APPROVED", mustChangePassword: false,
  authVersion: 1, adminTotpVerified: false, source: "database", issuedAt: 1, expiresAt: 2,
};

test("team score query bounds pagination and forbids ambiguous or unrelated filters", () => {
  assert.deepEqual(queryModule.parseTeamScoreQuery(origin), { playerId: null, query: "", page: 1, pageSize: 20 });
  assert.deepEqual(queryModule.parseTeamScoreQuery(`${origin}?playerId=${playerId}&page=2&pageSize=10`), { playerId, query: "", page: 2, pageSize: 10 });
  assert.equal(queryModule.parseTeamScoreQuery(`${origin}?q=${encodeURIComponent("  Ａ 선수  ")}`).query, "A 선수");
  for (const query of ["?unknown=1", "?page=0", "?page=-1", "?page=1.2", "?page=1e2", "?page=100001", "?page=", "?pageSize=51", "?pageSize=0",
    "?page=1&page=2", "?q=a&q=b", "?q=%0A", `?q=${"a".repeat(101)}`, `?playerId=${playerId}&q=a`, "?playerId=", "?playerId=bad", `?playerId=${playerId}&playerId=${playerId}`]) {
    assert.throws(() => queryModule.parseTeamScoreQuery(`${origin}${query}`), (error: unknown) => error instanceof TeamBalanceServiceError && error.code === "INVALID_INPUT", query);
  }
});

async function route(session: AuthSession | null, result: unknown = { kind: "overview" }, failure?: unknown) {
  const source = await readFile(new URL("../src/app/api/admin/balance-ai/team-scores/route.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const calls: queryModule.TeamScoreQuery[] = [];
  const dependencies: Record<string, unknown> = {
    "@/platform/db/client": { getDatabase: () => ({}) },
    "@/platform/http": http,
    "@/modules/team-tools/application/team-score-query": queryModule,
    "@/modules/team-tools/domain/team-balance-draft": { TeamBalanceServiceError },
    "@/modules/team-tools/infrastructure/postgres-team-score-repository": {
      PostgresTeamScoreRepository: class {
        async read(query: queryModule.TeamScoreQuery) { calls.push(query); if (failure) throw failure; return result; }
      },
    },
    "@/modules/team-tools/infrastructure/team-balance-http": {
      ...teamBalanceHttp,
      async requireTeamBalanceApiSession(role: AuthRole) {
        assert.equal(role, "ADMIN");
        const decision = authorizeSession(session, role);
        return decision.allowed ? { ok: true, session: decision.session }
          : { ok: false, response: new Response(null, { status: decision.reason === "UNAUTHENTICATED" ? 401 : 403 }) };
      },
    },
  };
  const subject = { exports: {} as { GET(request: Request): Promise<Response> } };
  vm.runInNewContext(code, { exports: subject.exports, require(specifier: string) {
    assert.ok(Object.hasOwn(dependencies, specifier), specifier);
    return dependencies[specifier];
  } });
  return { ...subject.exports, calls };
}

test("team scores expose admin data only to approved ADMIN-purpose ADMIN and SUPER_ADMIN sessions", async () => {
  const cases: { session: AuthSession | null; status: number }[] = [
    { session: admin, status: 200 }, { session: { ...admin, role: "SUPER_ADMIN" }, status: 200 },
    { session: { ...admin, role: "USER", purpose: "ACCOUNT" }, status: 403 },
    { session: { ...admin, role: "USER" }, status: 403 }, { session: { ...admin, purpose: "ACCOUNT" }, status: 403 },
    { session: { ...admin, role: "SUPER_ADMIN", purpose: "ACCOUNT" }, status: 403 },
    { session: { ...admin, accountStatus: "SUSPENDED" }, status: 403 },
    { session: { ...admin, mustChangePassword: true }, status: 403 }, { session: null, status: 401 },
  ];
  for (const { session, status } of cases) {
    const subject = await route(session);
    const response = await subject.GET(new Request(`${origin}?playerId=${playerId}`));
    assert.equal(response.status, status);
    assert.equal(subject.calls.length, status === 200 ? 1 : 0);
    if (status === 200) {
      assert.match(response.headers.get("cache-control")!, /no-store/);
      assert.equal(response.headers.get("etag"), null, "override revision does not version independent projection and audit data");
      assert.equal(subject.calls[0]?.playerId, playerId);
    }
  }
});

test("team score HTTP rejects malformed queries before repository access and sanitizes storage failures", async () => {
  const subject = await route(admin);
  const invalid = await subject.GET(new Request(`${origin}?pageSize=9999`));
  assert.equal(invalid.status, 400);
  assert.equal(subject.calls.length, 0);
  const missing = await route(admin, null, new TeamBalanceServiceError("NOT_FOUND", "private details"));
  assert.equal((await missing.GET(new Request(`${origin}?playerId=${playerId}`))).status, 404);
  const failed = await route(admin, null, new Error("private database credentials"));
  const response = await failed.GET(new Request(origin));
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /credentials|private database/);
});
