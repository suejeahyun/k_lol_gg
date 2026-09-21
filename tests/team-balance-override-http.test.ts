import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { AuthSession } from "../src/modules/auth/domain/auth-session";
import { prepareTeamBalanceMutation, teamBalanceMutationResponse } from "../src/modules/team-tools/infrastructure/team-balance-http";
import { parseTeamBalanceOverride } from "../src/modules/team-tools/domain/team-balance-override";

const session: AuthSession = {
  sessionId: "11111111-1111-4111-8111-111111111111", userId: "22222222-2222-4222-8222-222222222222",
  role: "SUPER_ADMIN", purpose: "ADMIN", accountStatus: "APPROVED", mustChangePassword: false,
  authVersion: 1, adminTotpVerified: true, source: "database", issuedAt: 1, expiresAt: 2,
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
      assert.equal(prepared.value.context.actorSession.role, "SUPER_ADMIN");
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
test("override route and Korean control retain ADMIN read, SUPER mutation and optimistic concurrency", async () => {
  const route = await readFile(new URL("../src/app/api/admin/balance-ai/team-overrides/route.ts", import.meta.url), "utf8");
  const control = await readFile(new URL("../src/app/(admin)/admin/balance-ai/team-balance-override-actions.tsx", import.meta.url), "utf8");
  assert.match(route, /requireTeamBalanceApiSession\("ADMIN", request\)/);
  assert.match(route, /requireTeamBalanceApiSession\("SUPER_ADMIN", request\)/);
  assert.match(route, /prepareTeamBalanceMutation\(request, scope, auth.session\)/);
  assert.match(route, /params.getAll\("playerId"\).length !== 1/);
  assert.match(control, /"If-Match"/);
  assert.match(control, /response.status === 412/);
  assert.match(control, /팀 편성 전용 보정/);
  assert.match(control, /새 계산 또는 초안 재평가부터 적용/);
});
