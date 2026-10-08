import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import type { AuthRole, AuthSession } from "../src/modules/auth/domain/auth-session";
import { authorizeSession } from "../src/modules/auth/application/authorize-session";
import * as http from "../src/platform/http";
import { teamBalanceCommandEnvelope } from "../src/modules/team-tools/application/team-balance-service";
import type { TeamBalanceCommandEnvelope } from "../src/modules/team-tools/application/ports/team-balance-repository";
import * as teamBalanceHttp from "../src/modules/team-tools/infrastructure/team-balance-http";
import * as override from "../src/modules/team-tools/domain/team-balance-override";
import { TeamBalanceServiceError } from "../src/modules/team-tools/domain/team-balance-draft";
import { prepareTeamBalanceMutation, teamBalanceMutationResponse } from "../src/modules/team-tools/infrastructure/team-balance-http";
import { parseTeamBalanceOverride } from "../src/modules/team-tools/domain/team-balance-override";

const session: AuthSession = {
  sessionId: "11111111-1111-4111-8111-111111111111", userId: "22222222-2222-4222-8222-222222222222",
  role: "ADMIN", purpose: "ADMIN", accountStatus: "APPROVED", mustChangePassword: false,
  authVersion: 1, adminTotpVerified: false, source: "database", issuedAt: 1, expiresAt: 2,
};
const body = { playerId: "33333333-3333-4333-8333-333333333333", score: 25, reason: "확인한 편성 보정" };
function request(options: { origin?: string; revision?: string | null; key?: string | null; query?: string; value?: unknown } = {}) {
  const headers = new Headers({ "Content-Type": "application/json", Origin: options.origin ?? "https://v2.example" });
  if (options.revision !== null) headers.set("If-Match", options.revision ?? '"0"');
  if (options.key !== null) headers.set("Idempotency-Key", options.key ?? "team-override-contract-0001");
  return new Request(`https://v2.example/api/admin/balance-ai/team-overrides${options.query ?? ""}`, { method: "POST", headers, body: JSON.stringify(options.value ?? body) });
}
test("team override HTTP binds origin, scope, revision and idempotency; response is private and replayable", async () => {
  const previous = process.env.V2_PUBLIC_ORIGIN;
  process.env.V2_PUBLIC_ORIGIN = "https://v2.example";
  try {
    const prepared = await prepareTeamBalanceMutation(request(), "admin:team-balance:override", session);
    assert.equal(prepared.ok, true);
    if (prepared.ok) {
      assert.deepEqual(parseTeamBalanceOverride(prepared.value.body), body);
      assert.equal(prepared.value.context.authorization, "ADMIN_MUTATION");
      assert.equal(prepared.value.context.actorSession.role, "ADMIN");
      assert.equal(prepared.value.expectedRevision, 0);
    }
    for (const options of [{ origin: "https://other.example" }, { revision: null }, { revision: 'W/"0"' }, { key: null }, { query: "?score=100" }]) {
      const rejected = await prepareTeamBalanceMutation(request(options), "admin:team-balance:override", session);
      assert.equal(rejected.ok, false);
    }
    const response = teamBalanceMutationResponse({ body: { ...body, revision: 1 }, status: 200, revision: 1, replayed: true });
    assert.equal(response.headers.get("etag"), '"1"');
    assert.equal(response.headers.get("idempotency-replayed"), "true");
    assert.match(response.headers.get("cache-control")!, /no-store/);
  } finally {
    if (previous === undefined) delete process.env.V2_PUBLIC_ORIGIN; else process.env.V2_PUBLIC_ORIGIN = previous;
  }
});
test("override GET and POST allow ADMIN and SUPER_ADMIN only through approved admin-purpose sessions", async () => {
  const source = await readFile(new URL("../src/app/api/admin/balance-ai/team-overrides/route.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const previous = process.env.V2_PUBLIC_ORIGIN;
  process.env.V2_PUBLIC_ORIGIN = "https://v2.example";
  try {
    const cases: { name: string; current: AuthSession | null; status: number }[] = [
      { name: "ADMIN", current: session, status: 200 },
      { name: "SUPER_ADMIN", current: { ...session, role: "SUPER_ADMIN" }, status: 200 },
      { name: "USER", current: { ...session, role: "USER", purpose: "ACCOUNT" }, status: 403 },
      { name: "USER admin-purpose", current: { ...session, role: "USER" }, status: 403 },
      { name: "ADMIN account-purpose", current: { ...session, purpose: "ACCOUNT" }, status: 403 },
      { name: "SUPER_ADMIN account-purpose", current: { ...session, role: "SUPER_ADMIN", purpose: "ACCOUNT" }, status: 403 },
      { name: "suspended ADMIN", current: { ...session, accountStatus: "SUSPENDED" }, status: 403 },
      { name: "ADMIN password change required", current: { ...session, mustChangePassword: true }, status: 403 },
      { name: "anonymous", current: null, status: 401 },
    ];
    for (const { name, current, status } of cases) {
      let reads = 0;
      const writes: TeamBalanceCommandEnvelope[] = [];
      const dependencies: Record<string, unknown> = {
        "@/platform/db/client": { getDatabase: () => ({}) },
        "@/platform/http": http,
        "@/modules/team-tools/application/team-balance-service": { teamBalanceCommandEnvelope },
        "@/modules/team-tools/domain/team-balance-override": override,
        "@/modules/team-tools/domain/team-balance-draft": { TeamBalanceServiceError },
        "@/modules/team-tools/infrastructure/postgres-team-balance-repository": {
          PostgresTeamBalanceRepository: class {
            async getPlayerOverride(playerId: string) { reads++; return { playerId, revision: 0, score: 0 }; }
            async setPlayerOverride(envelope: TeamBalanceCommandEnvelope, expectedRevision: number, input: unknown) {
              writes.push(envelope);
              assert.equal(expectedRevision, 0);
              assert.deepEqual(input, body);
              return { body: { ...body, revision: 1 }, status: 200, revision: 1, replayed: false };
            }
          },
        },
        "@/modules/team-tools/infrastructure/team-balance-http": {
          ...teamBalanceHttp,
          async requireTeamBalanceApiSession(role: AuthRole) {
            assert.equal(role, "ADMIN", name);
            const decision = authorizeSession(current, role);
            return decision.allowed ? { ok: true, session: decision.session }
              : { ok: false, response: new Response(null, { status: decision.reason === "UNAUTHENTICATED" ? 401 : 403 }) };
          },
        },
      };
      const subject = { exports: {} as { GET(request: Request): Promise<Response>; POST(request: Request): Promise<Response> } };
      vm.runInNewContext(code, { exports: subject.exports, URL, require(specifier: string) {
        assert.ok(Object.hasOwn(dependencies, specifier), specifier);
        return dependencies[specifier];
      } });
      const read = await subject.exports.GET(new Request(`https://v2.example/api/admin/balance-ai/team-overrides?playerId=${body.playerId}`));
      const saved = await subject.exports.POST(request());
      assert.equal(read.status, status, `${name} GET`);
      assert.equal(saved.status, status, `${name} POST`);
      assert.equal(reads, status === 200 ? 1 : 0, `${name} repository reads`);
      assert.equal(writes.length, status === 200 ? 1 : 0, `${name} repository writes`);
      if (status === 200) {
        assert.equal(writes[0]?.actorSession.role, current?.role);
        assert.equal(writes[0]?.authorization, "ADMIN_MUTATION");
        assert.equal(writes[0]?.scope, "admin:team-balance:override");
        assert.equal(saved.headers.get("etag"), '"1"');
        assert.match(saved.headers.get("cache-control")!, /no-store/);
      }
    }
  } finally {
    if (previous === undefined) delete process.env.V2_PUBLIC_ORIGIN; else process.env.V2_PUBLIC_ORIGIN = previous;
  }
});

test("override route and control retain mutation validation and optimistic concurrency", async () => {
  const route = await readFile(new URL("../src/app/api/admin/balance-ai/team-overrides/route.ts", import.meta.url), "utf8");
  const control = await readFile(new URL("../src/app/(admin)/admin/balance-ai/team-balance-override-actions.tsx", import.meta.url), "utf8");
  assert.match(route, /prepareTeamBalanceMutation\(request, scope, auth.session\)/);
  assert.match(route, /params.getAll\("playerId"\).length !== 1/);
  assert.match(control, /"If-Match"/);
  assert.match(control, /response.status === 412/);
});
