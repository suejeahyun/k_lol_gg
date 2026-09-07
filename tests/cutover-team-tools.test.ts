import assert from "node:assert/strict";
import test from "node:test";

import {
  importV1TeamTools,
  V1_TEAM_TOOLS_IMPORT_STEPS,
} from "../scripts/cutover/import-v1-team-tools";
import type { CutoverClient } from "../scripts/cutover/types";

function fakeClient(
  sourceCounts: Readonly<Record<string, number>>,
  options: Readonly<{ failingIntegrity?: string; shortTarget?: string }> = {},
) {
  const targetCounts = new Map<string, number>();
  const queries: string[] = [];
  const client = {
    async query(statement: unknown) {
      const sql = String(statement);
      queries.push(sql);

      const integrity = sql.match(/\/\* integrity:([^*]+) \*\//u)?.[1];
      if (integrity) {
        return { rows: [{ count: integrity === options.failingIntegrity ? "1" : "0" }], rowCount: 1 };
      }

      const count = sql.match(/\/\* count:([^:]+):(source|target) \*\//u);
      if (count) {
        const [, name, side] = count;
        const value = side === "source"
          ? sourceCounts[name!] ?? 0
          : targetCounts.get(name!) ?? 0;
        return { rows: [{ count: String(value) }], rowCount: 1 };
      }

      const imported = sql.match(/\/\* import:([^*]+) \*\//u)?.[1];
      if (imported) {
        const sourceCount = sourceCounts[imported] ?? 0;
        targetCounts.set(imported, imported === options.shortTarget ? Math.max(0, sourceCount - 1) : sourceCount);
        return { rows: [], rowCount: sourceCount };
      }

      throw new Error(`Unexpected SQL in fake cutover client: ${sql.slice(0, 100)}`);
    },
  } as unknown as CutoverClient;

  return { client, queries };
}

test("season applications, saved drafts, and MMR projections import idempotently", async () => {
  const counts = Object.fromEntries(
    V1_TEAM_TOOLS_IMPORT_STEPS.map((step, index) => [step.name, index + 1]),
  );
  const { client, queries } = fakeClient(counts);

  const first = await importV1TeamTools(client);
  const second = await importV1TeamTools(client);

  assert.deepEqual(
    first.map((step) => step.insertedCount),
    V1_TEAM_TOOLS_IMPORT_STEPS.map((_, index) => index + 1),
  );
  assert.deepEqual(second.map((step) => step.insertedCount), V1_TEAM_TOOLS_IMPORT_STEPS.map(() => 0));
  assert.equal(queries.some((sql) => /\b(begin|commit|rollback)\b/iu.test(sql)), false);
  assert.equal(
    queries.filter((sql) => sql.includes("/* import:") && /on conflict/iu.test(sql)).length,
    V1_TEAM_TOOLS_IMPORT_STEPS.length * 2,
  );
});

test("uses fully-qualified source tables and deterministic full target UUID kinds", () => {
  const sql = V1_TEAM_TOOLS_IMPORT_STEPS.map((step) => step.importSql).join("\n");

  for (const table of [
    "SeasonParticipationApply",
    "SeasonParticipationPendingApply",
    "TeamBalanceDraft",
    "TeamBalanceDraftPlayer",
    "PlayerBalanceProfile",
    "BalanceMatchReview",
    "PlayerBalanceMatchResult",
  ]) {
    assert.match(sql, new RegExp(`public\\.\"${table}\"`));
  }

  for (const kind of [
    "auth.user_accounts",
    "registry.players",
    "competition.seasons",
    "competition.season_applications",
    "competition.season_kakao_pending_applications",
    "team_tools.team_balance_drafts",
    "team_tools.team_balance_draft_candidates",
    "competition.match_series",
    "competition.match_games",
    "mmr.projection_runs",
    "mmr.match_result_events",
  ]) {
    assert.ok(sql.includes(`pg_temp.klol_legacy_uuid('${kind}'`), kind);
  }

  assert.match(sql, /V1_INTERNAL_MMR_1/u);
  assert.match(sql, /'balanceMatchReviews'/u);
  assert.match(sql, /actualPerformanceScore/u);
});

test("unrepresentable source data fails before the first target write", async () => {
  const { client, queries } = fakeClient({}, { failingIntegrity: "MMR result values and relationships" });

  await assert.rejects(
    () => importV1TeamTools(client),
    /blocked by MMR result values and relationships: 1 problem row/u,
  );
  assert.match(queries.join("\n"), /result\."gameId"/u);
  assert.equal(queries.some((sql) => sql.includes("/* import:")), false);
});

test("preflight explicitly covers missing draft owners, nullable legacy game IDs, and review provenance", () => {
  const { client, queries } = fakeClient({}, { failingIntegrity: "cutover administrator" });

  return assert.rejects(() => importV1TeamTools(client), /cutover administrator/u).then(() => {
    const audit = queries.join("\n");
    assert.match(audit, /role::text in \('SUPER_ADMIN', 'ADMIN'\)/u);
    assert.match(audit, /review\."draftId" is not null and draft\.id is null/u);
  });
});

test("source/target count mismatch requests caller rollback", async () => {
  const counts = Object.fromEntries(V1_TEAM_TOOLS_IMPORT_STEPS.map((step) => [step.name, 2]));
  const { client } = fakeClient(counts, { shortTarget: "team-balance-draft-candidates" });

  await assert.rejects(
    () => importV1TeamTools(client),
    /team-balance-draft-candidates reconciliation failed: source=2, target=1/u,
  );
});
