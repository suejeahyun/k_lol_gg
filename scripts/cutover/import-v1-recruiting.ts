import type { QueryResultRow } from "pg";

import type { CutoverClient, CutoverStepResult } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

type CountRow = QueryResultRow & Readonly<{ count: string | number }>;
type ImportStep = Readonly<{
  name: string;
  sourceCountSql: string;
  targetCountSql: string;
  importSql: string;
  values?: readonly unknown[];
  targetValues?: readonly unknown[];
}>;

export type ImportV1RecruitingOptions = Readonly<{ actorUserAccountId: string }>;

export const V1_RECRUITING_SCHEMA_GAPS = Object.freeze([
  "RecruitPartyLog has no V2 append-only party-history table; only its latest timestamp contributes to parties.last_activity_at.",
  "RecruitPartyDiscordMonitor has no V2 Discord-monitor snapshot table; only its latest timestamp contributes to parties.last_activity_at.",
  "RecruitParty roomName, hostName, startTimeText, tierText, preferredLineText, playStyle, and note have no columns in recruiting.parties.",
  "V1 operation-form rawText and sourceHash have no privacy-bounded provenance table in V2 and are not copied into user-facing payload_json.",
  "V1 operation-form requesterLineupJson, opponentLineupJson, and seriesRuleText have no fields in the strict V2 operation-form payload contracts.",
  "Finished/reset V1 parties can retain more member rows than maxMembers; V2 maximum_members is raised to the preserved member count for those archives.",
  "DestructionScrimRecruit title, team-name snapshots, lineup JSON, memo, source text/hash, and series-rule text have no columns in recruiting.scrims.",
] as const);

const statusSql = `case source.status
  when 'PENDING' then 'PENDING'::recruiting.operation_form_status
  when 'CHECKED' then 'IN_REVIEW'::recruiting.operation_form_status
  when 'APPROVED' then 'COMPLETED'::recruiting.operation_form_status
  when 'DONE' then 'COMPLETED'::recruiting.operation_form_status
  when 'CONFIRMED' then 'COMPLETED'::recruiting.operation_form_status
  when 'REJECTED' then 'REJECTED'::recruiting.operation_form_status
  when 'CANCELLED' then 'CANCELLED'::recruiting.operation_form_status
end`;

const friendDiscordChangeSql = `case
  when source."discordNicknameChange" is null or btrim(source."discordNicknameChange") = '' then false
  else true
end`;

const friendAdminNoteSql = `nullif(concat_ws(E'\n',
  nullif(btrim(source.memo), ''),
  case when nullif(btrim(source."discordNicknameChange"), '') is null then null
    else '기존 Discord 닉네임 변경: ' || normalize(btrim(source."discordNicknameChange"), NFKC) end
), '')`;

const meetupDateSql = `btrim(source."eventDateText")`;

const partyMembersJsonSql = `coalesce((
  select jsonb_agg(jsonb_build_object(
    'name', normalized.name,
    'position', normalized.position,
    'slotNo', normalized.slot_no,
    'substitute', normalized.is_substitute
  ) order by normalized.is_substitute, normalized.slot_no, normalized.id)
    from (
      select member.id,
             normalize(btrim(member.name), NFKC) as name,
             case
               when member.position is null then null
               when upper(btrim(member.position)) = 'JUG' then 'JGL'
               else upper(btrim(member.position))
             end as position,
             coalesce(
               member."slotNo",
               (select coalesce(max(existing."slotNo"), 0)
                  from public."RecruitPartyMember" existing
                 where existing."partyId" = member."partyId"
                   and existing."isSubstitute" = member."isSubstitute")
               + row_number() over (
                   partition by member."partyId", member."isSubstitute", (member."slotNo" is null)
                   order by member.id
                 )
             ) as slot_no,
             member."isSubstitute" as is_substitute
        from public."RecruitPartyMember" member
       where member."partyId" = source.id
    ) normalized
), '[]'::jsonb)`;

const scrimBestOfSql = `case
  when source."gameCount" in (1, 3, 5) then source."gameCount"
  when source."seriesRuleText" ~* '(BO[[:space:]]*1|단판|1[[:space:]]*판)' then 1
  when source."seriesRuleText" ~* '(BO[[:space:]]*3|3[[:space:]]*판[[:space:]]*2[[:space:]]*선)' then 3
  when source."seriesRuleText" ~* '(BO[[:space:]]*5|5[[:space:]]*판[[:space:]]*3[[:space:]]*선)' then 5
  else null
end`;

const operationFormsSourceSql = `
  select source.id::bigint * 10 + 1 as legacy_key, 'friends'::text as form_type,
         ${statusSql} as target_status,
         jsonb_build_object(
           'applicantName', normalize(btrim(source.sender), NFKC),
           'applicantNickname', normalize(btrim(source.sender), NFKC),
           'friendName', normalize(btrim(source."friendName"), NFKC),
           'friendNickname', normalize(btrim(source."friendNickname"), NFKC),
           'usagePeriod', normalize(btrim(source."usageType" || case when nullif(btrim(source."gameName"), '') is null then '' else ' (' || btrim(source."gameName") || ')' end), NFKC),
           'discordNicknameChange', ${friendDiscordChangeSql}
         ) as payload_json,
         btrim(source."roomName") as source_room_id, btrim(source.sender) as source_sender_id,
         ${friendAdminNoteSql} as admin_note,
         source.status <> 'PENDING' as reviewed,
         source."createdAt" at time zone 'UTC' as submitted_at,
         source."updatedAt" at time zone 'UTC' as updated_at
    from public."KakaoFriendApplication" source
  union all
  select source.id::bigint * 10 + 2, 'leaves', ${statusSql},
         jsonb_build_object(
           'applicantName', normalize(btrim(source."requesterInfo"), NFKC),
           'applicantNickname', normalize(btrim(source.sender), NFKC),
           'periodStart', null, 'periodEnd', null,
           'legacyPeriodText', normalize(btrim(source."leavePeriod"), NFKC),
           'reason', normalize(btrim(replace(source.reason, chr(13), '')), NFKC),
           'scope', normalize(btrim(source.scope), NFKC)
         ),
         btrim(source."roomName"), btrim(source.sender), nullif(btrim(source.memo), ''),
         source.status <> 'PENDING', source."createdAt" at time zone 'UTC', source."updatedAt" at time zone 'UTC'
    from public."KakaoLeaveRequest" source
  union all
  select source.id::bigint * 10 + 3, 'meetups', ${statusSql},
         jsonb_build_object(
           'hostName', normalize(btrim(source."hostInfo"), NFKC),
           'hostNickname', normalize(btrim(source.sender), NFKC),
           'meetupAt', null,
           'legacyDateText', normalize(${meetupDateSql}, NFKC),
           'location', normalize(btrim(source.place), NFKC),
           'participants', to_jsonb(array(
             select normalize(btrim(participant), NFKC)
               from regexp_split_to_table(replace(source.participants, chr(13), ''), E'[,\\n]+') participant
              where btrim(participant) <> ''
           ))
         ),
         btrim(source."roomName"), btrim(source.sender), nullif(btrim(source.memo), ''),
         source.status <> 'PENDING', source."createdAt" at time zone 'UTC', source."updatedAt" at time zone 'UTC'
    from public."KakaoMeetupRecord" source
  union all
  select source.id::bigint * 10 + 4, 'suggestions', ${statusSql},
         jsonb_build_object(
           'applicantName', normalize(btrim(source."requesterInfo"), NFKC),
           'applicantNickname', normalize(btrim(source.sender), NFKC),
           'reason', normalize(btrim(replace(source.reason, chr(13), '')), NFKC),
           'content', normalize(btrim(replace(source.content, chr(13), '')), NFKC)
         ),
         btrim(source."roomName"), btrim(source.sender), nullif(btrim(source.memo), ''),
         source.status <> 'PENDING', source."createdAt" at time zone 'UTC', source."updatedAt" at time zone 'UTC'
    from public."KakaoSuggestionRequest" source
`;

function safeCount(value: string | number | undefined, label: string): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(value ?? "", 10);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`${label} returned an invalid count.`);
  return parsed;
}

async function count(
  client: CutoverClient,
  sql: string,
  label: string,
  values: readonly unknown[] = [],
): Promise<number> {
  const result = await client.query<CountRow>(sql, [...values]);
  return safeCount(result.rows[0]?.count, label);
}

async function assertZero(client: CutoverClient, name: string, sql: string): Promise<void> {
  const problems = await count(client, `/* integrity:${name} */ ${sql}`, name);
  if (problems !== 0) throw new Error(`V1 recruiting import blocked by ${name}: ${problems} problem row(s).`);
}

async function assertIntegrity(client: CutoverClient, actorUserAccountId: string): Promise<void> {
  await assertZero(client, "recruit party values", `select count(*)::bigint as count
    from public."RecruitParty" party
   where party.id <= 0
      or party."recruitDate" !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$'
      or not pg_input_is_valid(party."recruitDate", 'date')
      or party."resetSeq" < 0 or party."recruitNo" not between 1 and 99
      or party.type::text not in ('FLEX_RANK','NORMAL_GAME','SOLO_RANK','ARAM','TFT_NORMAL','TFT_RANK','DOUBLE_UP','PARTY_NUMBER','PARTY_RIFT','OTHER_GAME')
      or party.status::text not in ('DRAFT','IN_PROGRESS','FINISHED','CANCELED','RESET')
      or char_length(btrim(party.title)) not between 1 and 160
      or party."maxMembers" not between 1 and 99
      or party."protectedUntil" is not null and party."scheduledStartAt" is not null and party."protectedUntil" < party."scheduledStartAt"
      or (select count(*) from public."RecruitPartyMember" member where member."partyId" = party.id) > 99`);

  await assertZero(client, "recruit party members", `select count(*)::bigint as count
    from public."RecruitPartyMember" member
    left join public."RecruitParty" party on party.id = member."partyId"
   where party.id is null
      or char_length(normalize(btrim(member.name), NFKC)) not between 1 and 80
      or member.position is not null and upper(btrim(member.position)) not in ('TOP','JGL','JUG','MID','ADC','SUP')
      or member."slotNo" is not null and member."slotNo" not between 1 and 99
      or member."slotNo" is null and (
        (select coalesce(max(existing."slotNo"), 0)
           from public."RecruitPartyMember" existing
          where existing."partyId" = member."partyId"
            and existing."isSubstitute" = member."isSubstitute")
        + (select count(*)
             from public."RecruitPartyMember" missing
            where missing."partyId" = member."partyId"
              and missing."isSubstitute" = member."isSubstitute"
              and missing."slotNo" is null)
      ) > 99`);

  await assertZero(client, "destruction scrim values", `select count(*)::bigint as count
    from public."DestructionScrimRecruit" source
   where source.id <= 0
      or source."recruitDate" !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$'
      or not pg_input_is_valid(source."recruitDate", 'date')
      or source."scrimNo" not between 1 and 99
      or source.status::text not in ('RECRUITING','MATCHED','CONFIRMED','COMPLETED','CANCELED')
      or char_length(btrim(source.title)) not between 1 and 160
      or source."requesterTeamName" is not null and char_length(btrim(source."requesterTeamName")) not between 1 and 120
      or source."opponentTeamName" is not null and char_length(btrim(source."opponentTeamName")) not between 1 and 120
      or source."requesterTeamId" is null and char_length(btrim(source."requesterTeamName")) not between 1 and 120
      or (source.status::text = 'RECRUITING' and source."opponentTeamId" is not null)
      or (source.status::text in ('MATCHED','CONFIRMED') and source."opponentTeamId" is null)
      or source."requesterTeamId" = source."opponentTeamId"`);

  await assertZero(client, "destruction scrim relationships", `select count(*)::bigint as count
    from public."DestructionScrimRecruit" source
    left join public."DestructionTournament" tournament on tournament.id = source."tournamentId"
    left join public."DestructionTeam" requester
      on requester.id = source."requesterTeamId" and requester."tournamentId" = source."tournamentId"
    left join public."DestructionTeam" opponent
      on opponent.id = source."opponentTeamId" and opponent."tournamentId" = source."tournamentId"
    left join competition.destruction_competitions target_tournament
      on target_tournament.id = pg_temp.klol_legacy_uuid('competition.destruction_competitions', source."tournamentId")
   where tournament.id is null or target_tournament.id is null
      or (source."requesterTeamId" is not null and requester.id is null)
      or (source."opponentTeamId" is not null and opponent.id is null)`);

  await assertZero(client, "operation form common values", `select count(*)::bigint as count from (
    select status, "roomName", sender, memo from public."KakaoFriendApplication"
    union all select status, "roomName", sender, memo from public."KakaoLeaveRequest"
    union all select status, "roomName", sender, memo from public."KakaoMeetupRecord"
    union all select status, "roomName", sender, memo from public."KakaoSuggestionRequest"
  ) source
  where source.status not in ('PENDING','CHECKED','APPROVED','REJECTED','DONE','CONFIRMED','CANCELLED')
     or source."roomName" is null or char_length(btrim(source."roomName")) not between 1 and 128
     or source.sender is null or char_length(normalize(btrim(source.sender), NFKC)) not between 1 and 64
     or source.memo is not null and char_length(btrim(source.memo)) > 2000`);

  await assertZero(client, "friend operation payload", `select count(*)::bigint as count
    from public."KakaoFriendApplication" source
   where char_length(normalize(btrim(source."friendName"), NFKC)) not between 1 and 100
      or char_length(normalize(btrim(source."friendNickname"), NFKC)) not between 1 and 64
      or char_length(normalize(btrim(source."usageType" || case when nullif(btrim(source."gameName"), '') is null then '' else ' (' || btrim(source."gameName") || ')' end), NFKC)) not between 1 and 160
      or coalesce(char_length(${friendAdminNoteSql}), 0) > 2000`);

  await assertZero(client, "suggestion operation payload", `select count(*)::bigint as count
    from public."KakaoSuggestionRequest" source
   where char_length(normalize(btrim(source."requesterInfo"), NFKC)) not between 1 and 100
      or char_length(normalize(btrim(replace(source.reason, chr(13), '')), NFKC)) not between 1 and 500
      or char_length(normalize(btrim(replace(source.content, chr(13), '')), NFKC)) not between 1 and 4000`);

  await assertZero(client, "meetup operation payload", `select count(*)::bigint as count
    from public."KakaoMeetupRecord" source
   where char_length(normalize(btrim(source."hostInfo"), NFKC)) not between 1 and 100
      or ${meetupDateSql} is null or char_length(normalize(${meetupDateSql}, NFKC)) not between 1 and 160
      or char_length(normalize(btrim(source.place), NFKC)) not between 1 and 240
      or (select count(*) from regexp_split_to_table(replace(source.participants, chr(13), ''), E'[,\\n]+') participant where btrim(participant) <> '') not between 1 and 30
      or exists (select 1 from regexp_split_to_table(replace(source.participants, chr(13), ''), E'[,\\n]+') participant where btrim(participant) <> '' and char_length(normalize(btrim(participant), NFKC)) > 100)
      or (select count(*) from regexp_split_to_table(replace(source.participants, chr(13), ''), E'[,\\n]+') participant where btrim(participant) <> '') <>
         (select count(distinct normalize(btrim(participant), NFKC)) from regexp_split_to_table(replace(source.participants, chr(13), ''), E'[,\\n]+') participant where btrim(participant) <> '')`);

  await assertZero(client, "leave operation payload", `select count(*)::bigint as count
    from public."KakaoLeaveRequest" source
   where char_length(normalize(btrim(source."requesterInfo"), NFKC)) not between 1 and 100
      or char_length(normalize(btrim(source."leavePeriod"), NFKC)) not between 1 and 160
      or char_length(normalize(btrim(replace(source.reason, chr(13), '')), NFKC)) not between 1 and 1000
      or char_length(normalize(btrim(source.scope), NFKC)) not between 1 and 160`);

  const actor = await count(client, `/* integrity:recruiting cutover actor */ select count(*)::bigint as count
    from auth.user_accounts
   where id = $1::uuid and role = 'SUPER_ADMIN' and status = 'APPROVED' and deleted_at is null`, "recruiting cutover actor", [actorUserAccountId]);
  if (actor !== 1) throw new Error("V1 recruiting import blocked by recruiting cutover actor: expected one approved SUPER_ADMIN.");
}

function buildSteps(actorUserAccountId: string): readonly ImportStep[] {
  return Object.freeze([
    {
      name: "recruiting-parties",
      sourceCountSql: `/* count:recruiting-parties:source */ select count(*)::bigint as count from public."RecruitParty"`,
      targetCountSql: `/* count:recruiting-parties:target */ select count(*)::bigint as count
        from public."RecruitParty" source
        join recruiting.parties target
          on target.id = pg_temp.klol_legacy_uuid('recruiting.parties', source.id)
         and target.recruit_date = source."recruitDate"::date
         and target.reset_sequence = source."resetSeq"
         and target.recruit_number = source."recruitNo"
         and target.type::text = source.type::text
         and target.status::text = source.status::text
         and target.title = btrim(source.title)
         and target.maximum_members = greatest(source."maxMembers", (select count(*) from public."RecruitPartyMember" member where member."partyId" = source.id))
         and target.members_json = ${partyMembersJsonSql}`,
      importSql: `/* import:recruiting-parties */
        insert into recruiting.parties (
          id, revision, owner_user_account_id, recruit_date, reset_sequence, recruit_number,
          type, status, title, maximum_members, members_json, scheduled_start_at,
          protected_until, last_activity_at, created_at, updated_at
        )
        select pg_temp.klol_legacy_uuid('recruiting.parties', source.id), 0, null,
               source."recruitDate"::date, source."resetSeq", source."recruitNo",
               source.type::text::recruiting.party_type, source.status::text::recruiting.party_status,
               btrim(source.title), greatest(source."maxMembers", (select count(*) from public."RecruitPartyMember" member where member."partyId" = source.id)),
               ${partyMembersJsonSql},
               source."scheduledStartAt" at time zone 'UTC', source."protectedUntil" at time zone 'UTC',
               greatest(
                 source."updatedAt",
                 coalesce((select max(log."createdAt") from public."RecruitPartyLog" log
                   where log."recruitDate" = source."recruitDate" and log."resetSeq" = source."resetSeq" and log."recruitNo" = source."recruitNo"), source."updatedAt"),
                 coalesce((select monitor."updatedAt" from public."RecruitPartyDiscordMonitor" monitor where monitor."partyId" = source.id), source."updatedAt")
               ) at time zone 'UTC',
               source."createdAt" at time zone 'UTC', source."updatedAt" at time zone 'UTC'
          from public."RecruitParty" source order by source.id
        on conflict (id) do nothing`,
    },
    {
      name: "recruiting-operation-forms",
      sourceCountSql: `/* count:recruiting-operation-forms:source */ select count(*)::bigint as count from (${operationFormsSourceSql}) source`,
      targetCountSql: `/* count:recruiting-operation-forms:target */ select count(*)::bigint as count
        from (${operationFormsSourceSql}) source
        join recruiting.operation_forms target
          on target.id = pg_temp.klol_legacy_uuid('recruiting.operation_forms', source.legacy_key)
         and target.form_type::text = source.form_type
         and target.status = source.target_status
         and target.payload_json = source.payload_json
         and target.source_room_id = source.source_room_id
         and target.source_sender_id = source.source_sender_id
         and target.admin_note is not distinct from source.admin_note
         and target.reviewed_by_user_account_id is not distinct from
             case when source.reviewed then $1::uuid else null end
         and target.reviewed_at is not distinct from
             case when source.reviewed then source.updated_at else null end`,
      importSql: `/* import:recruiting-operation-forms */
        insert into recruiting.operation_forms (
          id, revision, form_type, status, payload_json, source_room_id, source_sender_id,
          admin_note, reviewed_by_user_account_id, reviewed_at, deleted_at,
          deleted_by_user_account_id, deletion_reason, submitted_at, created_at, updated_at
        )
        select pg_temp.klol_legacy_uuid('recruiting.operation_forms', source.legacy_key), 0,
               source.form_type::recruiting.operation_form_type, source.target_status,
               source.payload_json, source.source_room_id, source.source_sender_id, source.admin_note,
               case when source.reviewed then $1::uuid else null end,
               case when source.reviewed then source.updated_at else null end,
               null, null, null, source.submitted_at, source.submitted_at, source.updated_at
          from (${operationFormsSourceSql}) source order by source.legacy_key
        on conflict (id) do nothing`,
      values: [actorUserAccountId],
      targetValues: [actorUserAccountId],
    },
    {
      name: "recruiting-destruction-scrims",
      sourceCountSql: `/* count:recruiting-destruction-scrims:source */ select count(*)::bigint as count from public."DestructionScrimRecruit"`,
      targetCountSql: `/* count:recruiting-destruction-scrims:target */ select count(*)::bigint as count
        from public."DestructionScrimRecruit" source
        join recruiting.scrims target
          on target.id = pg_temp.klol_legacy_uuid('recruiting.scrims', source.id)
         and target.recruit_date = source."recruitDate"::date
         and target.scrim_number = source."scrimNo"
         and target.tournament_id = pg_temp.klol_legacy_uuid('competition.destruction_competitions', source."tournamentId")
         and target.requester_team_id is not distinct from case when source."requesterTeamId" is null then null
               else pg_temp.klol_legacy_uuid('competition.destruction_teams', source."requesterTeamId") end
         and target.opponent_team_id is not distinct from case when source."opponentTeamId" is null then null
               else pg_temp.klol_legacy_uuid('competition.destruction_teams', source."opponentTeamId") end
         and target.legacy_title = btrim(source.title)
         and target.requester_team_name is not distinct from nullif(btrim(source."requesterTeamName"), '')
         and target.opponent_team_name is not distinct from nullif(btrim(source."opponentTeamName"), '')
         and target.status::text = source.status::text
         and target.scheduled_at is not distinct from (source."scheduledAt" at time zone 'UTC')
         and target.best_of is not distinct from ${scrimBestOfSql}
         and target.created_at = (source."createdAt" at time zone 'UTC')
         and target.updated_at = (greatest(source."updatedAt", coalesce((
               select max(log."createdAt") from public."DestructionScrimRecruitLog" log
                where log."recruitDate" = source."recruitDate"
                  and log."scrimNo" = source."scrimNo"
                  and (log."tournamentId" is null or log."tournamentId" = source."tournamentId")
             ), source."updatedAt")) at time zone 'UTC')`,
      importSql: `/* import:recruiting-destruction-scrims */
        insert into recruiting.scrims (
          id, revision, owner_user_account_id, recruit_date, scrim_number, tournament_id,
          requester_team_id, opponent_team_id, legacy_title, requester_team_name,
          opponent_team_name, status, scheduled_at, best_of, created_at, updated_at
        )
        select pg_temp.klol_legacy_uuid('recruiting.scrims', source.id), 0, null,
               source."recruitDate"::date, source."scrimNo",
               pg_temp.klol_legacy_uuid('competition.destruction_competitions', source."tournamentId"),
               case when source."requesterTeamId" is null then null
                    else pg_temp.klol_legacy_uuid('competition.destruction_teams', source."requesterTeamId") end,
               case when source."opponentTeamId" is null then null
                    else pg_temp.klol_legacy_uuid('competition.destruction_teams', source."opponentTeamId") end,
               btrim(source.title), nullif(btrim(source."requesterTeamName"), ''),
               nullif(btrim(source."opponentTeamName"), ''),
               source.status::text::recruiting.scrim_status,
               source."scheduledAt" at time zone 'UTC', ${scrimBestOfSql},
               source."createdAt" at time zone 'UTC',
               greatest(source."updatedAt", coalesce((
                 select max(log."createdAt") from public."DestructionScrimRecruitLog" log
                  where log."recruitDate" = source."recruitDate"
                    and log."scrimNo" = source."scrimNo"
                    and (log."tournamentId" is null or log."tournamentId" = source."tournamentId")
               ), source."updatedAt")) at time zone 'UTC'
          from public."DestructionScrimRecruit" source order by source.id
        on conflict (id) do nothing`,
    },
  ]);
}

export async function importV1Recruiting(
  client: CutoverClient,
  options: ImportV1RecruitingOptions,
): Promise<readonly CutoverStepResult[]> {
  if (!UUID.test(options.actorUserAccountId)) throw new Error("cutover actorUserAccountId is not a UUID.");
  await assertIntegrity(client, options.actorUserAccountId);
  const results: CutoverStepResult[] = [];

  for (const step of buildSteps(options.actorUserAccountId)) {
    const sourceCount = await count(client, step.sourceCountSql, `${step.name} source`);
    const beforeCount = await count(client, step.targetCountSql, `${step.name} target before import`, step.targetValues);
    await client.query(step.importSql, [...(step.values ?? [])]);
    const targetCount = await count(client, step.targetCountSql, `${step.name} target after import`, step.targetValues);
    if (targetCount !== sourceCount) {
      throw new Error(`${step.name} reconciliation failed: source=${sourceCount}, target=${targetCount}.`);
    }
    if (targetCount < beforeCount) throw new Error(`${step.name} target count decreased inside the import transaction.`);
    results.push({ name: step.name, sourceCount, targetCount, insertedCount: targetCount - beforeCount });
  }
  return Object.freeze(results);
}
