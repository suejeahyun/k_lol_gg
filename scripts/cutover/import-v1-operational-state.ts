import type { QueryResultRow } from "pg";

import type { CutoverClient, CutoverStepResult } from "./types";

type CountRow = QueryResultRow & Record<string, string | number | null | undefined>;

export type ImportV1OperationalStateOptions = Readonly<{
  actorUserAccountId: string;
}>;

type PreservationDisposition = "ALLOWLIST_PROJECTION" | "DO_NOT_COPY";

export type OperationalCutoverPolicy = Readonly<{
  name: string;
  disposition: PreservationDisposition;
  sourceTables: readonly string[];
  targetTable: string | null;
  reason: string;
}>;

const BOOLEAN_SETTING_KEYS = Object.freeze([
  "globalEnabled",
  "maintenanceMode",
  "playerRecordSearchEnabled",
  "recordCommandEnabled",
  "recentCommandEnabled",
  "rankingCommandEnabled",
  "seasonApplyCommandEnabled",
  "seasonSnapshotForwardEnabled",
  "seasonStatusCommandEnabled",
  "disciplineEvidenceEnabled",
  "inhouseResultImageEnabled",
  "recruitCommandEnabled",
  "recruitHelpCommandEnabled",
  "recruitCreateCommandEnabled",
  "recruitJoinCommandEnabled",
  "recruitFinishCommandEnabled",
  "recruitStatusCommandEnabled",
  "operationFormsEnabled",
  "friendApplicationEnabled",
  "leaveRequestEnabled",
  "meetupRecordEnabled",
  "suggestionRequestEnabled",
] as const);

/**
 * Historical observability rows do not become V2 audit rows: they lack the V2
 * request identity and may contain raw messages, IP addresses, user agents, or
 * provider identifiers. Ephemeral state is deliberately restarted rather than
 * resuming an unknown external operation after cutover.
 */
export const V1_OPERATIONAL_CUTOVER_POLICY: readonly OperationalCutoverPolicy[] = Object.freeze([
  {
    name: "kakao-operation-settings-projection",
    disposition: "ALLOWLIST_PROJECTION",
    sourceTables: Object.freeze(["KakaoOperationSetting"]),
    targetTable: "recruiting.kakao_operation_settings",
    reason: "Only the V2 feature gates and maximum message length are projected; room, sender, memo, response text, and logging controls are not copied.",
  },
  {
    name: "excluded-observability-history",
    disposition: "DO_NOT_COPY",
    sourceTables: Object.freeze([
      "AdminLog",
      "RateLimitLog",
      "RiotAccountLinkLog",
      "RiotApiRequestLog",
      "OperationAiRequest",
      "DiscordVoiceEvent",
      "DiscordOperationLog",
      "DiscordAccountLinkLog",
      "DiscordRoleSyncLog",
      "DiscordNotificationLog",
      "DiscordAdminActionLog",
      "DiscordNicknameHistory",
      "DiscordAttendanceSnapshot",
      "RecruitPartyLog",
      "DestructionScrimRecruitLog",
    ]),
    targetTable: null,
    reason: "Historical logs are not authoritative state and can contain PII, provider identifiers, raw payloads, prompts, or request metadata.",
  },
  {
    name: "excluded-ephemeral-integration-state",
    disposition: "DO_NOT_COPY",
    sourceTables: Object.freeze([
      "RiotApiStatus",
      "RiotSyncJob",
      "RiotRsoVerificationState",
      "KakaoImageReceiveSession",
      "KakaoInboundImage",
      "DiscordBotHeartbeat",
      "DiscordRecruitVerification",
      "DiscordMatchAttendanceCheck",
      "RecruitPartyDiscordMonitor",
    ]),
    targetTable: null,
    reason: "Leases, retries, one-time OAuth state, webhook dedupe state, image staging state, and live health snapshots must restart fail-closed.",
  },
  {
    name: "excluded-unmapped-settings-and-cache",
    disposition: "DO_NOT_COPY",
    sourceTables: Object.freeze(["DiscordOperationSetting", "KakaoFormTemplate", "AppDataCache"]),
    targetTable: null,
    reason: "V2 has no equivalent Discord settings store; caches are rebuilt from authoritative V2 data and arbitrary JSON is never promoted to configuration.",
  },
]);

const SETTINGS_SOURCE_SQL = `
  select coalesce(setting.value, '{}'::jsonb) as value,
         setting."updatedAt" at time zone 'UTC' as updated_at
    from (values (1)) singleton(id)
    left join public."KakaoOperationSetting" setting
      on setting.key = 'kakao.operation'
`;

// Where V1 had several independent switches but V2 has one coarse gate, AND is
// intentional: cutover may disable a combined feature but must never widen it.
const SETTINGS_PROJECTION_SQL = `
  select
    coalesce((source.value ->> 'globalEnabled')::boolean, true) as global_enabled,
    coalesce((source.value ->> 'maintenanceMode')::boolean, false) as maintenance_mode,
    coalesce((source.value ->> 'playerRecordSearchEnabled')::boolean, true)
      and coalesce((source.value ->> 'recordCommandEnabled')::boolean, true)
      and coalesce((source.value ->> 'recentCommandEnabled')::boolean, true)
      and coalesce((source.value ->> 'rankingCommandEnabled')::boolean, true)
      as player_search_enabled,
    coalesce((source.value ->> 'seasonApplyCommandEnabled')::boolean, true)
      and coalesce((source.value ->> 'seasonSnapshotForwardEnabled')::boolean, true)
      and coalesce((source.value ->> 'seasonStatusCommandEnabled')::boolean, true)
      as season_applications_enabled,
    coalesce((source.value ->> 'disciplineEvidenceEnabled')::boolean, false)
      and coalesce((source.value ->> 'inhouseResultImageEnabled')::boolean, false)
      as image_receive_enabled,
    coalesce((source.value ->> 'recruitCommandEnabled')::boolean, true)
      and coalesce((source.value ->> 'recruitHelpCommandEnabled')::boolean, true)
      and coalesce((source.value ->> 'recruitCreateCommandEnabled')::boolean, true)
      and coalesce((source.value ->> 'recruitJoinCommandEnabled')::boolean, true)
      and coalesce((source.value ->> 'recruitFinishCommandEnabled')::boolean, true)
      and coalesce((source.value ->> 'recruitStatusCommandEnabled')::boolean, true)
      and coalesce((source.value ->> 'operationFormsEnabled')::boolean, true)
      and coalesce((source.value ->> 'friendApplicationEnabled')::boolean, true)
      and coalesce((source.value ->> 'leaveRequestEnabled')::boolean, true)
      and coalesce((source.value ->> 'meetupRecordEnabled')::boolean, true)
      and coalesce((source.value ->> 'suggestionRequestEnabled')::boolean, true)
      as recruiting_enabled,
    true as scheduled_notice_enabled,
    coalesce((source.value ->> 'maxMessageLength')::integer, 4000) as max_message_length,
    source.updated_at
  from (${SETTINGS_SOURCE_SQL}) source
`;

function count(row: CountRow | undefined, key: string): number {
  const parsed = Number(row?.[key]);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`V1 operational cutover returned an invalid ${key} count.`);
  }
  return parsed;
}

function rejectNonzero(row: CountRow | undefined, keys: readonly string[]) {
  const failures = keys.filter((key) => count(row, key) !== 0);
  if (failures.length > 0) {
    throw new Error(`V1 operational cutover preflight failed: ${failures.join(", ")}.`);
  }
}

function unionCount(tables: readonly string[]): string {
  return tables.map((table) => `select 1 from public."${table}"`).join(" union all ");
}

// These are the policy tables physically present in the supported V1 schema.
// The policy above intentionally also names legacy variants that may appear in
// other V1 revisions, but static SQL must not reference relations absent here.
const historicalTables = Object.freeze([
  "AdminLog", "RateLimitLog", "RiotAccountLinkLog", "RiotApiRequestLog",
  "OperationAiRequest", "DiscordVoiceEvent", "DiscordOperationLog",
  "DiscordAccountLinkLog", "RecruitPartyLog", "DestructionScrimRecruitLog",
]);
const ephemeralTables = Object.freeze([
  "RiotApiStatus", "RiotSyncJob", "KakaoImageReceiveSession",
  "KakaoInboundImage", "DiscordBotHeartbeat", "RecruitPartyDiscordMonitor",
]);
const unmappedTables = Object.freeze(["DiscordOperationSetting", "AppDataCache"]);

export async function importV1OperationalState(
  client: CutoverClient,
  options: ImportV1OperationalStateOptions,
): Promise<readonly CutoverStepResult[]> {
  const preflight = await client.query<CountRow>(`
    /* preflight:v1-operational-state */
    select
      case when not exists (
        select 1 from auth.user_accounts
         where id = $1::uuid and role = 'SUPER_ADMIN' and status = 'APPROVED' and deleted_at is null
      ) then 1 else 0 end::text as invalid_actor,
      (select count(*) from public."KakaoOperationSetting" where key = 'kakao.operation')::text as physical_settings,
      (select count(*) from public."KakaoOperationSetting" setting
        where setting.key = 'kakao.operation'
          and jsonb_typeof(setting.value) <> 'object')::text as invalid_settings_root,
      (select count(*) from public."KakaoOperationSetting" setting
        cross join (values ${BOOLEAN_SETTING_KEYS.map((key) => `('${key}')`).join(", ")}) allowed(key)
        where setting.key = 'kakao.operation'
          and setting.value ? allowed.key
          and jsonb_typeof(setting.value -> allowed.key) <> 'boolean')::text as invalid_boolean_settings,
      (select count(*) from public."KakaoOperationSetting" setting
        where setting.key = 'kakao.operation'
          and setting.value ? 'maxMessageLength'
          and case
            when jsonb_typeof(setting.value -> 'maxMessageLength') <> 'number' then true
            when (setting.value ->> 'maxMessageLength') !~ '^[0-9]+$' then true
            else (setting.value ->> 'maxMessageLength')::numeric not between 100 and 10000
          end)::text as invalid_max_message_length
  `, [options.actorUserAccountId]);
  const audit = preflight.rows[0];
  rejectNonzero(audit, [
    "invalid_actor",
    "invalid_settings_root",
    "invalid_boolean_settings",
    "invalid_max_message_length",
  ]);

  const targetBefore = await client.query<CountRow>(`
    /* count:kakao-operation-settings-projection:target-before */
    select count(*)::text as count
      from recruiting.kakao_operation_settings target
      join (${SETTINGS_PROJECTION_SQL}) expected on true
     where target.id = 1
       and target.revision = 0
       and target.global_enabled = expected.global_enabled
       and target.maintenance_mode = expected.maintenance_mode
       and target.player_search_enabled = expected.player_search_enabled
       and target.season_applications_enabled = expected.season_applications_enabled
       and target.image_receive_enabled = expected.image_receive_enabled
       and target.recruiting_enabled = expected.recruiting_enabled
       and target.scheduled_notice_enabled = expected.scheduled_notice_enabled
       and target.max_message_length = expected.max_message_length
       and target.updated_by_user_account_id = $1::uuid
  `, [options.actorUserAccountId]);
  const beforeCount = count(targetBefore.rows[0], "count");

  const updated = await client.query(`
    /* import:kakao-operation-settings-projection */
    update recruiting.kakao_operation_settings target
       set global_enabled = expected.global_enabled,
           maintenance_mode = expected.maintenance_mode,
           player_search_enabled = expected.player_search_enabled,
           season_applications_enabled = expected.season_applications_enabled,
           image_receive_enabled = expected.image_receive_enabled,
           recruiting_enabled = expected.recruiting_enabled,
           scheduled_notice_enabled = expected.scheduled_notice_enabled,
           max_message_length = expected.max_message_length,
           updated_by_user_account_id = $1::uuid,
           updated_at = coalesce(expected.updated_at, target.updated_at)
      from (${SETTINGS_PROJECTION_SQL}) expected
     where target.id = 1
       and target.revision = 0
       and target.updated_by_user_account_id is null
  `, [options.actorUserAccountId]);

  const targetAfter = await client.query<CountRow>(`
    /* count:kakao-operation-settings-projection:target-after */
    select count(*)::text as count
      from recruiting.kakao_operation_settings target
      join (${SETTINGS_PROJECTION_SQL}) expected on true
     where target.id = 1
       and target.revision = 0
       and target.global_enabled = expected.global_enabled
       and target.maintenance_mode = expected.maintenance_mode
       and target.player_search_enabled = expected.player_search_enabled
       and target.season_applications_enabled = expected.season_applications_enabled
       and target.image_receive_enabled = expected.image_receive_enabled
       and target.recruiting_enabled = expected.recruiting_enabled
       and target.scheduled_notice_enabled = expected.scheduled_notice_enabled
       and target.max_message_length = expected.max_message_length
       and target.updated_by_user_account_id = $1::uuid
  `, [options.actorUserAccountId]);
  const targetCount = count(targetAfter.rows[0], "count");
  if (targetCount !== 1) {
    throw new Error("kakao-operation-settings-projection reconciliation failed; target must exactly match the allowlisted V1 projection.");
  }

  const exclusions = await client.query<CountRow>(`
    /* count:v1-operational-exclusions */
    select
      (select count(*) from (${unionCount(historicalTables)}) historical)::text as historical_count,
      (select count(*) from (${unionCount(ephemeralTables)}) ephemeral)::text as ephemeral_count,
      ((select count(*) from (${unionCount(unmappedTables)}) unmapped)
        + (select count(*) from public."KakaoOperationSetting" where key <> 'kakao.operation'))::text as unmapped_count
  `);
  const excluded = exclusions.rows[0];
  const changedCount = typeof updated.rowCount === "number" ? updated.rowCount : Math.max(0, targetCount - beforeCount);

  return Object.freeze([
    {
      name: "kakao-operation-settings-projection",
      sourceCount: 1,
      targetCount,
      insertedCount: beforeCount === 1 ? 0 : changedCount,
    },
    {
      name: "excluded-observability-history",
      sourceCount: count(excluded, "historical_count"),
      targetCount: 0,
      insertedCount: 0,
    },
    {
      name: "excluded-ephemeral-integration-state",
      sourceCount: count(excluded, "ephemeral_count"),
      targetCount: 0,
      insertedCount: 0,
    },
    {
      name: "excluded-unmapped-settings-and-cache",
      sourceCount: count(excluded, "unmapped_count"),
      targetCount: 0,
      insertedCount: 0,
    },
  ]);
}
