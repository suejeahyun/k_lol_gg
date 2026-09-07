import type { CutoverClient, CutoverStepResult } from "./types";

type CountRow = Record<string, string | number | null | undefined>;

const ACCOUNT_UUID_KIND = "auth.user_accounts";
const PLAYER_UUID_KIND = "registry.players";

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

export async function importV1AuthRegistry(
  client: CutoverClient,
): Promise<readonly CutoverStepResult[]> {
  const accountPreflight = await client.query(`
    select
      count(*)::text as source_count,
      count(*) filter (
        where "id" is null or "id" <= 0
          or "userId" is null or btrim("userId") = ''
          or char_length(normalize(btrim("userId"), NFKC)) > 64
          or "authVersion" < 0
          or "role"::text not in ('USER', 'ADMIN', 'SUPER_ADMIN')
          or "status"::text not in ('PENDING', 'APPROVED', 'REJECTED')
      )::text as invalid_rows,
      (
        select count(*) from (
          select lower(normalize(btrim("userId"), NFKC))
          from public."UserAccount"
          group by lower(normalize(btrim("userId"), NFKC))
          having count(*) > 1
        ) duplicates
      )::text as duplicate_login_ids
    from public."UserAccount"
  `);
  const accountAudit = accountPreflight.rows[0] as CountRow | undefined;
  rejectNonzero(accountAudit, ["invalid_rows", "duplicate_login_ids"], "V1 accounts");
  const sourceAccountCount = count(accountAudit, "source_count");

  const playerPreflight = await client.query(`
    select
      count(*)::text as source_count,
      count(*) filter (
        where player."id" is null or player."id" <= 0
          or player."name" is null or btrim(player."name") = ''
          or char_length(normalize(btrim(player."name"), NFKC)) > 100
          or player."nickname" is null or btrim(player."nickname") = ''
          or char_length(normalize(btrim(player."nickname"), NFKC)) > 64
          or player."tag" is null or btrim(player."tag") = ''
          or char_length(normalize(btrim(player."tag"), NFKC)) > 32
          or (player."peakTier" is not null and char_length(player."peakTier") > 32)
          or (player."currentTier" is not null and char_length(player."currentTier") > 32)
      )::text as invalid_rows,
      count(*) filter (
        where player."userAccountId" is not null and account."id" is null
      )::text as missing_accounts,
      (
        select count(*) from (
          select lower(normalize(btrim("nickname"), NFKC)),
                 lower(normalize(btrim("tag"), NFKC))
          from public."Player"
          group by lower(normalize(btrim("nickname"), NFKC)),
                   lower(normalize(btrim("tag"), NFKC))
          having count(*) > 1
        ) duplicates
      )::text as duplicate_riot_ids,
      (
        select count(*) from (
          select nickname_normalized, migrated_tag_line_normalized
          from (
            select
              lower(normalize(btrim("nickname"), NFKC)) as nickname_normalized,
              case when row_number() over (
                partition by lower(normalize(btrim("nickname"), NFKC)),
                             lower(normalize(btrim("tag"), NFKC))
                order by "isActive" desc, ("userAccountId" is not null) desc, "id" desc
              ) = 1 then lower(normalize(btrim("tag"), NFKC))
              else 'legacy-' || "id"::text end as migrated_tag_line_normalized
            from public."Player"
          ) projected
          group by nickname_normalized, migrated_tag_line_normalized
          having count(*) > 1
        ) collisions
      )::text as generated_riot_id_collisions,
      (
        select count(*) from (
          select "userAccountId"
          from public."Player"
          where "userAccountId" is not null
          group by "userAccountId"
          having count(*) > 1
        ) duplicates
      )::text as duplicate_account_links
    from public."Player" player
    left join public."UserAccount" account on account."id" = player."userAccountId"
  `);
  const playerAudit = playerPreflight.rows[0] as CountRow | undefined;
  rejectNonzero(
    playerAudit,
    ["invalid_rows", "missing_accounts", "generated_riot_id_collisions", "duplicate_account_links"],
    "V1 players",
  );
  const sourcePlayerCount = count(playerAudit, "source_count");

  const accountInsert = await client.query(`
    with inserted as (
      insert into auth.user_accounts (
        id, legacy_id, login_id, login_id_normalized, password_hash, role, status,
        auth_version, revision, must_change_password, password_changed_at,
        status_changed_at, status_reason_public, status_reason_internal,
        terms_accepted_at, terms_version, privacy_accepted_at, privacy_version,
        created_at, updated_at, deleted_at
      )
      select
        pg_temp.klol_legacy_uuid('${ACCOUNT_UUID_KIND}', source."id"),
        source."id",
        normalize(btrim(source."userId"), NFKC),
        lower(normalize(btrim(source."userId"), NFKC)),
        source."passwordHash",
        source."role"::text::auth.user_role,
        source."status"::text::auth.account_status,
        source."authVersion",
        0,
        source."passwordHash" is null,
        null,
        source."updatedAt",
        null,
        null,
        source."termsAcceptedAt",
        case when source."termsAcceptedAt" is null then null else 'v1-legacy' end,
        source."privacyAcceptedAt",
        case when source."privacyAcceptedAt" is null then null else 'v1-legacy' end,
        source."createdAt",
        source."updatedAt",
        source."deletedAt"
      from public."UserAccount" source
      order by source."id"
      on conflict (legacy_id) do nothing
      returning 1
    )
    select count(*)::text as inserted_count from inserted
  `);
  const insertedAccountCount = count(accountInsert.rows[0] as CountRow | undefined, "inserted_count");

  const playerInsert = await client.query(`
    with ranked_source as (
      select source.*,
             row_number() over (
               partition by lower(normalize(btrim(source."nickname"), NFKC)),
                            lower(normalize(btrim(source."tag"), NFKC))
               order by source."isActive" desc,
                        (source."userAccountId" is not null) desc,
                        source."id" desc
             ) as riot_id_rank
      from public."Player" source
    ), inserted as (
      insert into registry.players (
        id, legacy_id, user_account_id, member_name, member_name_normalized,
        nickname, nickname_normalized, tag_line, tag_line_normalized,
        peak_tier, current_tier, status, deactivated_at,
        account_lifecycle_deactivated_at, revision, created_at, updated_at
      )
      select
        pg_temp.klol_legacy_uuid('${PLAYER_UUID_KIND}', source."id"),
        source."id",
        case when source."userAccountId" is null then null
          else pg_temp.klol_legacy_uuid('${ACCOUNT_UUID_KIND}', source."userAccountId") end,
        normalize(btrim(source."name"), NFKC),
        lower(normalize(btrim(source."name"), NFKC)),
        normalize(btrim(source."nickname"), NFKC),
        lower(normalize(btrim(source."nickname"), NFKC)),
        case when source.riot_id_rank = 1 then normalize(btrim(source."tag"), NFKC)
          else 'legacy-' || source."id"::text end,
        case when source.riot_id_rank = 1 then lower(normalize(btrim(source."tag"), NFKC))
          else 'legacy-' || source."id"::text end,
        source."peakTier",
        source."currentTier",
        case when source."isActive" then 'ACTIVE'::registry.player_status
          else 'INACTIVE'::registry.player_status end,
        case when source."isActive" then null
          else coalesce(source."deactivatedAt", source."createdAt") end,
        null,
        0,
        source."createdAt",
        source."createdAt"
      from ranked_source source
      order by source."id"
      on conflict (legacy_id) do nothing
      returning 1
    )
    select count(*)::text as inserted_count from inserted
  `);
  const insertedPlayerCount = count(playerInsert.rows[0] as CountRow | undefined, "inserted_count");

  const reconciliation = await client.query(`
    with ranked_players as (
      select source.*,
             row_number() over (
               partition by lower(normalize(btrim(source."nickname"), NFKC)),
                            lower(normalize(btrim(source."tag"), NFKC))
               order by source."isActive" desc,
                        (source."userAccountId" is not null) desc,
                        source."id" desc
             ) as riot_id_rank
      from public."Player" source
    )
    select
      (select count(*) from auth.user_accounts where legacy_id is not null)::text
        as target_account_count,
      (select count(*) from registry.players where legacy_id is not null)::text
        as target_player_count,
      (select count(*) from (
        select legacy_id from auth.user_accounts where legacy_id is not null
        group by legacy_id having count(*) > 1
      ) duplicate_ids)::text as duplicate_target_account_ids,
      (select count(*) from (
        select legacy_id from registry.players where legacy_id is not null
        group by legacy_id having count(*) > 1
      ) duplicate_ids)::text as duplicate_target_player_ids,
      (select count(*) from public."UserAccount" source
        left join auth.user_accounts target on target.legacy_id = source."id"
        where target.id is null)::text as missing_target_accounts,
      (select count(*) from auth.user_accounts target
        left join public."UserAccount" source on source."id" = target.legacy_id
        where target.legacy_id is not null and source."id" is null)::text as extra_target_accounts,
      (select count(*) from public."Player" source
        left join registry.players target on target.legacy_id = source."id"
        where target.id is null)::text as missing_target_players,
      (select count(*) from registry.players target
        left join public."Player" source on source."id" = target.legacy_id
        where target.legacy_id is not null and source."id" is null)::text as extra_target_players,
      (select count(*) from public."UserAccount" source
        join auth.user_accounts target on target.legacy_id = source."id"
        where target.id <> pg_temp.klol_legacy_uuid('${ACCOUNT_UUID_KIND}', source."id")
          or target.login_id <> normalize(btrim(source."userId"), NFKC)
          or target.login_id_normalized <> lower(normalize(btrim(source."userId"), NFKC))
          or target.password_hash is distinct from source."passwordHash"
          or target.role::text <> source."role"::text
          or target.status::text <> source."status"::text
          or target.auth_version <> source."authVersion"
          or target.terms_accepted_at is distinct from source."termsAcceptedAt"
          or target.privacy_accepted_at is distinct from source."privacyAcceptedAt"
          or target.created_at is distinct from source."createdAt"
          or target.updated_at is distinct from source."updatedAt"
          or target.deleted_at is distinct from source."deletedAt"
      )::text as mismatched_accounts,
      (select count(*) from ranked_players source
        join registry.players target on target.legacy_id = source."id"
        where target.id <> pg_temp.klol_legacy_uuid('${PLAYER_UUID_KIND}', source."id")
          or target.user_account_id is distinct from case
            when source."userAccountId" is null then null
            else pg_temp.klol_legacy_uuid('${ACCOUNT_UUID_KIND}', source."userAccountId") end
          or target.member_name <> normalize(btrim(source."name"), NFKC)
          or target.nickname <> normalize(btrim(source."nickname"), NFKC)
          or target.tag_line <> case when source.riot_id_rank = 1
            then normalize(btrim(source."tag"), NFKC)
            else 'legacy-' || source."id"::text end
          or target.peak_tier is distinct from source."peakTier"
          or target.current_tier is distinct from source."currentTier"
          or target.status::text <> case when source."isActive" then 'ACTIVE' else 'INACTIVE' end
      )::text as mismatched_players,
      (select count(*) from public."Player" source
        join registry.players target on target.legacy_id = source."id"
        left join auth.user_accounts account on account.id = target.user_account_id
        where (source."userAccountId" is null and target.user_account_id is not null)
          or (source."userAccountId" is not null and (
            account.id is null or account.legacy_id <> source."userAccountId"
          ))
      )::text as mismatched_account_links
  `);
  const finalAudit = reconciliation.rows[0] as CountRow | undefined;
  rejectNonzero(finalAudit, [
    "duplicate_target_account_ids",
    "duplicate_target_player_ids",
    "missing_target_accounts",
    "extra_target_accounts",
    "missing_target_players",
    "extra_target_players",
    "mismatched_accounts",
    "mismatched_players",
    "mismatched_account_links",
  ], "V1 auth/registry reconciliation");

  const targetAccountCount = count(finalAudit, "target_account_count");
  const targetPlayerCount = count(finalAudit, "target_player_count");
  if (sourceAccountCount !== targetAccountCount || sourcePlayerCount !== targetPlayerCount) {
    throw new Error("V1 auth/registry reconciliation failed: source and target counts differ.");
  }

  return [
    {
      name: "auth.user_accounts",
      sourceCount: sourceAccountCount,
      targetCount: targetAccountCount,
      insertedCount: insertedAccountCount,
    },
    {
      name: "registry.players",
      sourceCount: sourcePlayerCount,
      targetCount: targetPlayerCount,
      insertedCount: insertedPlayerCount,
    },
  ];
}
