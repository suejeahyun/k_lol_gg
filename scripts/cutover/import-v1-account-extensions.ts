import type { CutoverClient, CutoverStepResult } from "./types";

type CountRow = Record<string, string | number | null | undefined>;

export type ImportV1AccountExtensionsOptions = Readonly<{
  actorUserAccountId: string;
}>;

const ACCOUNT_UUID_KIND = "auth.user_accounts";
const PLAYER_UUID_KIND = "registry.players";
const DISCIPLINE_RECORD_UUID_KIND = "discipline.records";
const DISCIPLINE_TASK_UUID_KIND = "discipline.resolution_tasks";
const RIOT_LINK_UUID_KIND = "riot.account_links";

function count(row: CountRow | undefined, key: string): number {
  const value = Number(row?.[key]);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Cutover check returned an invalid ${key} count.`);
  }
  return value;
}

function rejectNonzero(row: CountRow | undefined, checks: readonly string[], scope: string) {
  const failures = checks.filter((key) => count(row, key) !== 0);
  if (failures.length > 0) {
    throw new Error(`${scope} preflight failed: ${failures.join(", ")}.`);
  }
}

export async function importV1AccountExtensions(
  client: CutoverClient,
  options: ImportV1AccountExtensionsOptions,
): Promise<readonly CutoverStepResult[]> {
  const disciplinePreflight = await client.query(`
    select
      (select count(*) from public."UserDisciplineRecord")::text as record_source_count,
      (select count(*) from public."DisciplineResolutionTask" task
        join public."UserDisciplineRecord" record on record."id" = task."disciplineRecordId"
        where record."userAccountId" is not null or record."playerId" is not null
      )::text as task_source_count,
      case when exists (select 1 from public."UserDisciplineRecord") and not exists (
        select 1 from auth.user_accounts actor
        where actor.id = $1::uuid
          and actor.role in ('ADMIN', 'SUPER_ADMIN')
          and actor.status = 'APPROVED'
          and actor.deleted_at is null
      ) then 1 else 0 end::text as invalid_actor,
      (select count(*) from public."UserDisciplineRecord" record
        where record."id" is null or record."id" <= 0
          or record."targetName" is null or btrim(record."targetName") = ''
          or char_length(normalize(btrim(record."targetName"), NFKC)) > 100
          or (record."targetNickname" is not null and char_length(normalize(btrim(record."targetNickname"), NFKC)) > 64)
          or (record."targetTag" is not null and char_length(normalize(btrim(record."targetTag"), NFKC)) > 32)
          or record."type" not in ('CAUTION', 'WARNING', 'BAN')
          or record."source" is null or btrim(record."source") = ''
          or char_length(record."source") > 64
          or record."reason" is null or btrim(record."reason") = ''
          or char_length(record."reason") > 1000
          or (record."note" is not null and char_length(record."note") > 2000)
          or (record."resetReason" is not null and char_length(record."resetReason") > 1000)
          or (record."isActive" and (record."resetAt" is not null or record."resetReason" is not null))
          or (not record."isActive" and (record."resetAt" is null or btrim(coalesce(record."resetReason", '')) = ''))
      )::text as invalid_records,
      (select count(*) from public."UserDisciplineRecord" record
        left join auth.user_accounts account on account.legacy_id = record."userAccountId"
        where record."userAccountId" is not null and account.id is null
      )::text as missing_record_accounts,
      (select count(*) from public."UserDisciplineRecord" record
        left join registry.players player on player.legacy_id = record."playerId"
        where record."playerId" is not null and player.id is null
      )::text as missing_record_players,
      (select count(*) from public."UserDisciplineRecord" record
        join public."Player" player on player."id" = record."playerId"
        where record."userAccountId" is not null
          and player."userAccountId" is distinct from record."userAccountId"
      )::text as mismatched_record_identities,
      (select count(*) from public."DisciplineResolutionTask" task
        join public."UserDisciplineRecord" record on record."id" = task."disciplineRecordId"
        where task."id" is null or task."id" <= 0
          or task."category" not in ('GENERAL', 'INHOUSE')
          or task."requiredGameCount" < 1 or task."requiredGameCount" > 100
          or task."publicCode" is null or btrim(task."publicCode") = ''
          or char_length(task."publicCode") > 64
          or task."dueAt" is null
      )::text as invalid_tasks,
      (select count(*) from public."DisciplineResolutionTask" task
        join public."UserDisciplineRecord" record on record."id" = task."disciplineRecordId"
        where (record."userAccountId" is not null or record."playerId" is not null)
          and (task."status"::text not in ('REQUIRED', 'AWAITING_UPLOAD')
            or task."claimedGameCount" <> 0
            or task."submittedAt" is not null
            or task."reviewedAt" is not null
            or task."reviewedById" is not null
            or task."reviewNote" is not null)
      )::text as unsupported_task_states
  `, [options.actorUserAccountId]);
  const disciplineAudit = disciplinePreflight.rows[0] as CountRow | undefined;
  rejectNonzero(disciplineAudit, [
    "invalid_actor",
    "invalid_records",
    "missing_record_accounts",
    "missing_record_players",
    "mismatched_record_identities",
    "invalid_tasks",
    "unsupported_task_states",
  ], "V1 discipline");
  const sourceDisciplineRecordCount = count(disciplineAudit, "record_source_count");
  const sourceDisciplineTaskCount = count(disciplineAudit, "task_source_count");

  const riotPreflight = await client.query(`
    select
      (select count(*) from public."PlayerRiotAccount")::text as link_source_count,
      (select count(*) from public."PlayerSoloRankSnapshot")::text as summary_source_count,
      (select count(*) from public."PlayerRiotAccount" link
        join public."Player" player on player."id" = link."playerId"
        where link."id" is null or link."id" <= 0
          or player."userAccountId" is null
          or link."gameName" is null or btrim(link."gameName") = ''
          or char_length(regexp_replace(normalize(btrim(link."gameName"), NFKC), '[[:space:]]+', ' ', 'g')) > 16
          or regexp_replace(normalize(btrim(link."gameName"), NFKC), '[[:space:]]+', ' ', 'g') ~ '[#[:cntrl:]]'
          or link."tagLine" is null or btrim(link."tagLine") = ''
          or char_length(regexp_replace(normalize(btrim(link."tagLine"), NFKC), '[[:space:]]+', '', 'g')) not between 1 and 5
          or regexp_replace(normalize(btrim(link."tagLine"), NFKC), '[[:space:]]+', '', 'g') ~ '[#[:cntrl:]]'
      )::text as invalid_links,
      (select count(*) from public."PlayerRiotAccount" link
        left join registry.players player on player.legacy_id = link."playerId"
        where player.id is null
      )::text as missing_link_players,
      (select count(*) from public."PlayerRiotAccount" link
        join public."Player" source_player on source_player."id" = link."playerId"
        left join auth.user_accounts account on account.legacy_id = source_player."userAccountId"
        where source_player."userAccountId" is null or account.id is null
      )::text as missing_link_owners,
      (select count(*) from public."PlayerSoloRankSnapshot" summary
        left join public."PlayerRiotAccount" link on link."playerId" = summary."playerId"
        where link."id" is null
      )::text as summaries_without_links,
      (select count(*) from public."PlayerSoloRankSnapshot" summary
        where summary."queueType" <> 'RANKED_SOLO_5x5'
          or (summary."tier" is not null and char_length(summary."tier") > 16)
          or (summary."rank" is not null and char_length(summary."rank") > 8)
          or summary."leaguePoints" < 0
          or summary."wins" < 0
          or summary."losses" < 0
      )::text as invalid_summaries
  `);
  const riotAudit = riotPreflight.rows[0] as CountRow | undefined;
  rejectNonzero(riotAudit, [
    "invalid_links",
    "missing_link_players",
    "missing_link_owners",
    "summaries_without_links",
    "invalid_summaries",
  ], "V1 Riot public summaries");
  const sourceRiotLinkCount = count(riotAudit, "link_source_count");
  const sourceRiotSummaryCount = count(riotAudit, "summary_source_count");

  const disciplineRecordInsert = await client.query(`
    with inserted as (
      insert into discipline.records (
        id, revision, identity_key, user_account_id, player_id, target_name,
        target_nickname, target_tag_line, type, category, source, reason,
        internal_note, active, reset_reason, reset_by_user_account_id, reset_at,
        created_by_user_account_id, created_at, updated_at
      )
      select
        pg_temp.klol_legacy_uuid('${DISCIPLINE_RECORD_UUID_KIND}', record."id"),
        0,
        case
          when record."userAccountId" is not null then
            'account:' || pg_temp.klol_legacy_uuid('${ACCOUNT_UUID_KIND}', record."userAccountId")::text
          when record."playerId" is not null then
            'player:' || pg_temp.klol_legacy_uuid('${PLAYER_UUID_KIND}', record."playerId")::text
          else 'direct:' || lower(normalize(btrim(record."targetName"), NFKC)) || '|' ||
            lower(normalize(btrim(coalesce(record."targetNickname", '')), NFKC)) || '|' ||
            lower(normalize(btrim(coalesce(record."targetTag", '')), NFKC))
        end,
        case when record."userAccountId" is null then null
          else pg_temp.klol_legacy_uuid('${ACCOUNT_UUID_KIND}', record."userAccountId") end,
        case when record."playerId" is null then null
          else pg_temp.klol_legacy_uuid('${PLAYER_UUID_KIND}', record."playerId") end,
        normalize(btrim(record."targetName"), NFKC),
        nullif(normalize(btrim(coalesce(record."targetNickname", '')), NFKC), ''),
        nullif(normalize(btrim(coalesce(record."targetTag", '')), NFKC), ''),
        record."type"::discipline.discipline_type,
        coalesce(task."category", 'GENERAL')::discipline.discipline_category,
        btrim(record."source"),
        record."reason",
        record."note",
        record."isActive",
        case when record."isActive" then null else record."resetReason" end,
        case when record."isActive" then null else $1::uuid end,
        case when record."isActive" then null else record."resetAt" end,
        $1::uuid,
        record."createdAt",
        record."updatedAt"
      from public."UserDisciplineRecord" record
      left join public."DisciplineResolutionTask" task
        on task."disciplineRecordId" = record."id"
      order by record."id"
      on conflict (id) do nothing
      returning 1
    )
    select count(*)::text as inserted_count from inserted
  `, [options.actorUserAccountId]);
  const insertedDisciplineRecordCount = count(
    disciplineRecordInsert.rows[0] as CountRow | undefined,
    "inserted_count",
  );

  const disciplineTaskInsert = await client.query(`
    with inserted as (
      insert into discipline.resolution_tasks (
        id, public_code, discipline_record_id, owner_user_account_id,
        owner_player_id, category, required_game_count, due_at, status,
        review_note, review_boundary_at, reviewed_by_user_account_id,
        reviewed_at, revision, created_at, updated_at
      )
      select
        pg_temp.klol_legacy_uuid('${DISCIPLINE_TASK_UUID_KIND}', task."id"),
        btrim(task."publicCode"),
        pg_temp.klol_legacy_uuid('${DISCIPLINE_RECORD_UUID_KIND}', task."disciplineRecordId"),
        case when record."userAccountId" is null then null
          else pg_temp.klol_legacy_uuid('${ACCOUNT_UUID_KIND}', record."userAccountId") end,
        case when record."playerId" is null then null
          else pg_temp.klol_legacy_uuid('${PLAYER_UUID_KIND}', record."playerId") end,
        task."category"::discipline.discipline_category,
        task."requiredGameCount",
        task."dueAt",
        task."status"::text::discipline.task_status,
        null,
        null,
        null,
        null,
        0,
        task."createdAt",
        task."updatedAt"
      from public."DisciplineResolutionTask" task
      join public."UserDisciplineRecord" record
        on record."id" = task."disciplineRecordId"
      where record."userAccountId" is not null or record."playerId" is not null
      order by task."id"
      on conflict (id) do nothing
      returning 1
    )
    select count(*)::text as inserted_count from inserted
  `);
  const insertedDisciplineTaskCount = count(
    disciplineTaskInsert.rows[0] as CountRow | undefined,
    "inserted_count",
  );

  const riotLinkInsert = await client.query(`
    with inserted as (
      insert into riot.account_links (
        id, revision, player_id, owner_user_account_id, game_name, tag_line,
        normalized_key, protected_puuid, method, status, linked_at,
        disconnected_at, created_at, updated_at
      )
      select
        pg_temp.klol_legacy_uuid('${RIOT_LINK_UUID_KIND}', link."id"),
        0,
        pg_temp.klol_legacy_uuid('${PLAYER_UUID_KIND}', link."playerId"),
        pg_temp.klol_legacy_uuid('${ACCOUNT_UUID_KIND}', player."userAccountId"),
        regexp_replace(normalize(btrim(link."gameName"), NFKC), '[[:space:]]+', ' ', 'g'),
        regexp_replace(normalize(btrim(link."tagLine"), NFKC), '[[:space:]]+', '', 'g'),
        lower(regexp_replace(normalize(btrim(link."gameName"), NFKC), '[[:space:]]+', ' ', 'g')) || '#' ||
          lower(regexp_replace(normalize(btrim(link."tagLine"), NFKC), '[[:space:]]+', '', 'g')),
        null,
        case
          when link."verificationMethod" = 'RSO' and link."isVerified" then 'RSO_VERIFIED'::riot.link_method
          when link."verificationMethod" like '%ADMIN%' then 'ADMIN'::riot.link_method
          else 'DIRECT_OWNER'::riot.link_method
        end,
        'DISCONNECTED'::riot.link_status,
        coalesce(link."linkedAt", link."createdAt"),
        coalesce(link."unlinkedAt", link."updatedAt", link."linkedAt", link."createdAt"),
        link."createdAt",
        link."updatedAt"
      from public."PlayerRiotAccount" link
      join public."Player" player on player."id" = link."playerId"
      order by link."id"
      on conflict (id) do nothing
      returning 1
    )
    select count(*)::text as inserted_count from inserted
  `);
  const insertedRiotLinkCount = count(riotLinkInsert.rows[0] as CountRow | undefined, "inserted_count");

  const riotSummaryInsert = await client.query(`
    with inserted as (
      insert into riot.summaries (
        player_id, link_id, game_name, tag_line, solo_tier, solo_rank,
        league_points, wins, losses, last_synced_at, updated_at
      )
      select
        pg_temp.klol_legacy_uuid('${PLAYER_UUID_KIND}', summary."playerId"),
        pg_temp.klol_legacy_uuid('${RIOT_LINK_UUID_KIND}', link."id"),
        regexp_replace(normalize(btrim(link."gameName"), NFKC), '[[:space:]]+', ' ', 'g'),
        regexp_replace(normalize(btrim(link."tagLine"), NFKC), '[[:space:]]+', '', 'g'),
        summary."tier",
        summary."rank",
        summary."leaguePoints",
        summary."wins",
        summary."losses",
        coalesce(link."lastSyncedAt", summary."updatedAt", link."updatedAt"),
        summary."updatedAt"
      from public."PlayerSoloRankSnapshot" summary
      join public."PlayerRiotAccount" link on link."playerId" = summary."playerId"
      order by summary."id"
      on conflict (player_id) do nothing
      returning 1
    )
    select count(*)::text as inserted_count from inserted
  `);
  const insertedRiotSummaryCount = count(
    riotSummaryInsert.rows[0] as CountRow | undefined,
    "inserted_count",
  );

  const reconciliation = await client.query(`
    select
      (select count(*) from public."UserDisciplineRecord" source
        join discipline.records target
          on target.id = pg_temp.klol_legacy_uuid('${DISCIPLINE_RECORD_UUID_KIND}', source."id")
      )::text as target_record_count,
      (select count(*) from public."DisciplineResolutionTask" source
        join public."UserDisciplineRecord" source_record
          on source_record."id" = source."disciplineRecordId"
        join discipline.resolution_tasks target
          on target.id = pg_temp.klol_legacy_uuid('${DISCIPLINE_TASK_UUID_KIND}', source."id")
        where source_record."userAccountId" is not null or source_record."playerId" is not null
      )::text as target_task_count,
      (select count(*) from public."PlayerRiotAccount" source
        join riot.account_links target
          on target.id = pg_temp.klol_legacy_uuid('${RIOT_LINK_UUID_KIND}', source."id")
      )::text as target_link_count,
      (select count(*) from public."PlayerSoloRankSnapshot" source
        join riot.summaries target
          on target.player_id = pg_temp.klol_legacy_uuid('${PLAYER_UUID_KIND}', source."playerId")
      )::text as target_summary_count,
      (select count(*) from public."UserDisciplineRecord" source
        left join discipline.records target
          on target.id = pg_temp.klol_legacy_uuid('${DISCIPLINE_RECORD_UUID_KIND}', source."id")
        where target.id is null
      )::text as missing_records,
      (select count(*) from public."DisciplineResolutionTask" source
        join public."UserDisciplineRecord" source_record
          on source_record."id" = source."disciplineRecordId"
        left join discipline.resolution_tasks target
          on target.id = pg_temp.klol_legacy_uuid('${DISCIPLINE_TASK_UUID_KIND}', source."id")
        where (source_record."userAccountId" is not null or source_record."playerId" is not null)
          and target.id is null
      )::text as missing_tasks,
      (select count(*) from public."PlayerRiotAccount" source
        left join riot.account_links target
          on target.id = pg_temp.klol_legacy_uuid('${RIOT_LINK_UUID_KIND}', source."id")
        where target.id is null
      )::text as missing_links,
      (select count(*) from public."PlayerSoloRankSnapshot" source
        left join riot.summaries target
          on target.player_id = pg_temp.klol_legacy_uuid('${PLAYER_UUID_KIND}', source."playerId")
        where target.player_id is null
      )::text as missing_summaries,
      (select count(*) from public."UserDisciplineRecord" source
        join discipline.records target
          on target.id = pg_temp.klol_legacy_uuid('${DISCIPLINE_RECORD_UUID_KIND}', source."id")
        left join public."DisciplineResolutionTask" task
          on task."disciplineRecordId" = source."id"
        where target.user_account_id is distinct from case when source."userAccountId" is null then null
            else pg_temp.klol_legacy_uuid('${ACCOUNT_UUID_KIND}', source."userAccountId") end
          or target.player_id is distinct from case when source."playerId" is null then null
            else pg_temp.klol_legacy_uuid('${PLAYER_UUID_KIND}', source."playerId") end
          or target.type::text <> source."type"
          or target.category::text <> coalesce(task."category", 'GENERAL')
          or target.reason <> source."reason"
          or target.active <> source."isActive"
          or target.created_by_user_account_id <> $1::uuid
      )::text as mismatched_records,
      (select count(*) from public."DisciplineResolutionTask" source
        join public."UserDisciplineRecord" source_record
          on source_record."id" = source."disciplineRecordId"
        join discipline.resolution_tasks target
          on target.id = pg_temp.klol_legacy_uuid('${DISCIPLINE_TASK_UUID_KIND}', source."id")
        where (source_record."userAccountId" is not null or source_record."playerId" is not null)
          and (target.discipline_record_id <> pg_temp.klol_legacy_uuid('${DISCIPLINE_RECORD_UUID_KIND}', source."disciplineRecordId")
          or target.public_code <> btrim(source."publicCode")
          or target.category::text <> source."category"
          or target.required_game_count <> source."requiredGameCount"
          or target.due_at is distinct from source."dueAt"
          or target.status::text <> source."status"::text)
      )::text as mismatched_tasks,
      (select count(*) from public."PlayerRiotAccount" source
        join public."Player" player on player."id" = source."playerId"
        join riot.account_links target
          on target.id = pg_temp.klol_legacy_uuid('${RIOT_LINK_UUID_KIND}', source."id")
        where target.player_id <> pg_temp.klol_legacy_uuid('${PLAYER_UUID_KIND}', source."playerId")
          or target.owner_user_account_id <> pg_temp.klol_legacy_uuid('${ACCOUNT_UUID_KIND}', player."userAccountId")
          or target.protected_puuid is not null
          or target.status <> 'DISCONNECTED'
          or target.game_name <> regexp_replace(normalize(btrim(source."gameName"), NFKC), '[[:space:]]+', ' ', 'g')
          or target.tag_line <> regexp_replace(normalize(btrim(source."tagLine"), NFKC), '[[:space:]]+', '', 'g')
      )::text as mismatched_links,
      (select count(*) from public."PlayerSoloRankSnapshot" source
        join public."PlayerRiotAccount" link on link."playerId" = source."playerId"
        join riot.summaries target
          on target.player_id = pg_temp.klol_legacy_uuid('${PLAYER_UUID_KIND}', source."playerId")
        where target.link_id <> pg_temp.klol_legacy_uuid('${RIOT_LINK_UUID_KIND}', link."id")
          or target.solo_tier is distinct from source."tier"
          or target.solo_rank is distinct from source."rank"
          or target.league_points is distinct from source."leaguePoints"
          or target.wins is distinct from source."wins"
          or target.losses is distinct from source."losses"
      )::text as mismatched_summaries
  `, [options.actorUserAccountId]);
  const finalAudit = reconciliation.rows[0] as CountRow | undefined;
  rejectNonzero(finalAudit, [
    "missing_records",
    "missing_tasks",
    "missing_links",
    "missing_summaries",
    "mismatched_records",
    "mismatched_tasks",
    "mismatched_links",
    "mismatched_summaries",
  ], "V1 account extensions reconciliation");

  const results: CutoverStepResult[] = [
    {
      name: "discipline.records",
      sourceCount: sourceDisciplineRecordCount,
      targetCount: count(finalAudit, "target_record_count"),
      insertedCount: insertedDisciplineRecordCount,
    },
    {
      name: "discipline.resolution_tasks",
      sourceCount: sourceDisciplineTaskCount,
      targetCount: count(finalAudit, "target_task_count"),
      insertedCount: insertedDisciplineTaskCount,
    },
    {
      name: "riot.account_links",
      sourceCount: sourceRiotLinkCount,
      targetCount: count(finalAudit, "target_link_count"),
      insertedCount: insertedRiotLinkCount,
    },
    {
      name: "riot.summaries",
      sourceCount: sourceRiotSummaryCount,
      targetCount: count(finalAudit, "target_summary_count"),
      insertedCount: insertedRiotSummaryCount,
    },
  ];
  if (results.some((result) => result.sourceCount !== result.targetCount)) {
    throw new Error("V1 account extensions reconciliation failed: source and target counts differ.");
  }
  return results;
}
