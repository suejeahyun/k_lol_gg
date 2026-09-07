import type { PoolClient, QueryResultRow } from "pg";

import type { CutoverStepResult } from "./types";

const V1_CORE_TABLES = Object.freeze([
  "UserAccount",
  "Player",
  "Champion",
  "Season",
  "MatchSeries",
  "MatchGame",
  "MatchParticipant",
]);

const V2_SCHEMAS = Object.freeze([
  "assets",
  "audit",
  "auth",
  "catalog",
  "competition",
  "discipline",
  "media",
  "mmr",
  "operations",
  "recruiting",
  "registry",
  "riot",
  "statistics",
  "team_tools",
]);

type CountRow = QueryResultRow & Readonly<{ count: string | number }>;

function toSafeCount(value: string | number, label: string): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${label} returned an invalid count.`);
  }
  return parsed;
}

export async function assertV1SourceDatabase(client: PoolClient): Promise<CutoverStepResult> {
  const tableRows = await client.query<{ table_name: string }>(
    `select table_name
       from information_schema.tables
      where table_schema = 'public'
        and table_type = 'BASE TABLE'
        and table_name = any($1::text[])
      order by table_name`,
    [V1_CORE_TABLES],
  );
  const found = new Set(tableRows.rows.map((row) => row.table_name));
  const missing = V1_CORE_TABLES.filter((table) => !found.has(table));
  if (missing.length > 0) {
    throw new Error(`V1 source preflight failed; missing tables: ${missing.join(", ")}`);
  }

  const sourceRows = await client.query<CountRow>(
    `select count(*)::bigint as count
       from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'`,
  );
  const targetRows = await client.query<CountRow>(
    `select count(*)::bigint as count
       from information_schema.tables
      where table_schema = any($1::text[]) and table_type = 'BASE TABLE'`,
    [V2_SCHEMAS],
  );

  return {
    name: "database-preflight",
    sourceCount: toSafeCount(sourceRows.rows[0]?.count ?? -1, "V1 table inventory"),
    targetCount: toSafeCount(targetRows.rows[0]?.count ?? -1, "V2 table inventory"),
    insertedCount: 0,
  };
}

export async function installTemporaryLegacyUuidFunction(client: PoolClient): Promise<void> {
  await client.query(`
    create or replace function pg_temp.klol_legacy_uuid(entity_kind text, legacy_id bigint)
    returns uuid
    language sql
    immutable
    strict
    as $function$
      select (
        substr(md5('klol.gg:v2:' || entity_kind || ':' || legacy_id::text), 1, 8) || '-' ||
        substr(md5('klol.gg:v2:' || entity_kind || ':' || legacy_id::text), 9, 4) || '-' ||
        '4' || substr(md5('klol.gg:v2:' || entity_kind || ':' || legacy_id::text), 14, 3) || '-' ||
        'a' || substr(md5('klol.gg:v2:' || entity_kind || ':' || legacy_id::text), 18, 3) || '-' ||
        substr(md5('klol.gg:v2:' || entity_kind || ':' || legacy_id::text), 21, 12)
      )::uuid
    $function$
  `);
}
