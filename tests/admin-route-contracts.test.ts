import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ADMIN_ROUTE_CONTRACTS,
  getAdminRouteContract,
  interpolateAdminRouteTarget,
  resolveAdminLegacyDestination,
  resolveAdminRouteContract,
} from "../src/modules/admin/domain/admin-route-contracts";

test("administrator parity ledger accounts for all 81 V1 pages exactly once", () => {
  assert.equal(ADMIN_ROUTE_CONTRACTS.length, 81);
  assert.equal(new Set(ADMIN_ROUTE_CONTRACTS.map(({ id }) => id)).size, 81);
  assert.equal(new Set(ADMIN_ROUTE_CONTRACTS.map(({ source }) => source)).size, 81);
  assert.deepEqual(
    ADMIN_ROUTE_CONTRACTS.map(({ id }) => id),
    Array.from({ length: 81 }, (_, index) => String(index + 1).padStart(3, "0")),
  );
});

test("administrator transition decisions preserve the approved totals", () => {
  const totals = Object.fromEntries(
    ["keep", "integrate", "redirect", "retire"].map((decision) => [
      decision,
      ADMIN_ROUTE_CONTRACTS.filter((contract) => contract.decision === decision).length,
    ]),
  );

  assert.deepEqual(totals, { keep: 42, integrate: 25, redirect: 12, retire: 2 });
});

test("runtime parity ledger cannot drift from the reviewed route map", () => {
  const routeMap = readFileSync(
    new URL("../docs/feature-catalog/ADMIN_ROUTE_MAP.md", import.meta.url),
    "utf8",
  );
  const documentedSources = [...routeMap.matchAll(/^\| (\d{3}) \| `([^`]+)` \|/gm)].map(
    ([, id, source]) => ({ id, source }),
  );

  assert.deepEqual(
    ADMIN_ROUTE_CONTRACTS.map(({ id, source }) => ({ id, source })),
    documentedSources,
  );
});

test("every destination stays inside the reviewed administrator or operations-doc boundary", () => {
  for (const contract of ADMIN_ROUTE_CONTRACTS) {
    assert.match(contract.source, /^\/admin(?:\/|$)/);
    assert.match(contract.target, /^\/(?:admin(?:\/|$)|docs\/operations\/)/);
  }

  assert.equal(getAdminRouteContract("/admin/players")?.decision, "keep");
  assert.equal(getAdminRouteContract("/admin/recruits")?.decision, "retire");
  assert.equal(getAdminRouteContract("/outside"), undefined);
});

test("legacy administrator routes resolve only to reviewed same-origin destinations", () => {
  assert.equal(
    resolveAdminLegacyDestination("/admin/players/player-123/edit"),
    "/admin/players/player-123?mode=edit",
  );
  assert.equal(
    resolveAdminLegacyDestination("/admin/balance-ai/reviews/review 7"),
    "/admin/balance-ai?tab=reviews&review=review%207",
  );
  assert.equal(resolveAdminLegacyDestination("/admin/players"), null);
  assert.equal(resolveAdminLegacyDestination("/admin/logs/kakao"), "/admin/kakao?tab=logs");
  assert.equal(resolveAdminLegacyDestination("/admin/unknown"), null);
  assert.equal(resolveAdminLegacyDestination("//attacker.invalid/admin/recruits"), null);
  assert.equal(resolveAdminLegacyDestination("/admin\\recruits"), null);
  assert.equal(resolveAdminLegacyDestination("/admin/recruits?next=https://attacker.invalid"), null);

  const trailingSlash = resolveAdminRouteContract("/admin/recruits/");
  assert.equal(trailingSlash?.contract.id, "063");
});

test("target interpolation rejects missing parameters and non-local destinations", () => {
  assert.throws(
    () => interpolateAdminRouteTarget("/admin/players/[playerId]", {}),
    /Missing administrator route parameter/,
  );
  assert.throws(
    () => interpolateAdminRouteTarget("//attacker.invalid/[id]", { id: "value" }),
    /same origin/,
  );
});
