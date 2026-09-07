import type { QueryResultRow } from "pg";

import type { CutoverClient, CutoverPhase, CutoverStepResult } from "./types";

type CountRow = QueryResultRow & Readonly<{ count: string | number }>;

type ImportStep = Readonly<{
  name: string;
  sourceCountSql: string;
  targetCountSql: string;
  importSql: string;
}>;

const FORMULA_VERSION = "V1_INTERNAL_MMR_1";
const GENERATION = 1;

const cutoverActorSql = `(
  select pg_temp.klol_legacy_uuid('auth.user_accounts', account.id)
    from public."UserAccount" account
   where account.role::text in ('SUPER_ADMIN', 'ADMIN')
     and account.status::text = 'APPROVED'
     and account."deletedAt" is null
   order by case account.role::text when 'SUPER_ADMIN' then 0 else 1 end, account.id
   limit 1
)`;

const reviewJsonSql = `coalesce((
  select jsonb_agg(
    jsonb_build_object(
      'legacyId', review.id,
      'matchSeriesId', review."matchSeriesId",
      'selectedOptionType', review."selectedOptionType",
      'predictedRedWinRate', review."predictedRedWinRate",
      'predictedBlueWinRate', review."predictedBlueWinRate",
      'actualWinner', review."actualWinner"::text,
      'redTotal', review."redTotal",
      'blueTotal', review."blueTotal",
      'diff', review.diff,
      'maxLineDiff', review."maxLineDiff",
      'midJglDiff', review."midJglDiff",
      'bottomDiff', review."bottomDiff",
      'autoCount', review."autoCount",
      'highTierOffRoleCount', review."highTierOffRoleCount",
      'qualityScore', review."qualityScore",
      'aiVerdict', review."aiVerdict",
      'aiRiskLevel', review."aiRiskLevel",
      'aiConfidence', review."aiConfidence",
      'aiInferredWinner', review."aiInferredWinner"::text,
      'aiReasoning', review."aiReasoning",
      'aiRiskFactors', review."aiRiskFactors",
      'aiFormulaVersion', review."aiFormulaVersion",
      'feedbackRating', review."feedbackRating",
      'feedbackProblemTeam', review."feedbackProblemTeam"::text,
      'feedbackProblemLine', review."feedbackProblemLine"::text,
      'feedbackMemo', review."feedbackMemo",
      'createdAt', review."createdAt",
      'updatedAt', review."updatedAt"
    ) order by review.id
  )
  from public."BalanceMatchReview" review
  where review."draftId" = draft.id
), '[]'::jsonb)`;

const integrityChecks = Object.freeze([
  {
    name: "season application values and relationships",
    sql: `select count(*)::bigint as count
            from public."SeasonParticipationApply" application
            left join public."Season" season on season.id = application."seasonId"
            left join public."Player" player on player.id = application."playerId"
           where application.id <= 0 or season.id is null or player.id is null
              or application."recruitNo" <= 0
              or application."sourceSlotNo" is not null and application."sourceSlotNo" <= 0
              or application."mainPosition" is null
              or application.status::text not in ('APPLIED', 'CONFIRMED', 'REJECTED', 'RESERVE', 'CANCELLED')
              or application.source not in ('SITE', 'KAKAO', 'KAKAO_RECRUIT', 'KAKAO_OPENCHAT')
              or application.source <> 'SITE' and (
                   application."sourceMessageHash" is null
                   or application."sourceMessageHash" !~ '^[0-9A-Fa-f]{64}$'
                 )
              `,
  },
  {
    name: "pending season application values",
    sql: `select count(*)::bigint as count
            from public."SeasonParticipationPendingApply" application
            left join public."Season" season on season.id = application."seasonId"
           where application.id <= 0 or season.id is null
              or application."recruitNo" <= 0
              or char_length(btrim(application.name)) not between 1 and 100
              or application."mainPosition" is null
              or application.source not in ('KAKAO', 'KAKAO_RECRUIT')
              or application."sourceMessageHash" is null
              or application."sourceMessageHash" !~ '^[0-9A-Fa-f]{64}$'
              or coalesce(
                   case when application."isReserve" then application."reserveSlotNo" else application."sourceSlotNo" end,
                   application."sourceSlotNo", application."reserveSlotNo"
                 ) is null
              or coalesce(
                   case when application."isReserve" then application."reserveSlotNo" else application."sourceSlotNo" end,
                   application."sourceSlotNo", application."reserveSlotNo"
                 ) <= 0
              `,
  },
  {
    name: "pending season application target identity",
    sql: `select count(*)::bigint as count from (
      select application."seasonId", application."applyDate", application."recruitNo",
             coalesce(
               case when application."isReserve" then application."reserveSlotNo" else application."sourceSlotNo" end,
               application."sourceSlotNo", application."reserveSlotNo"
             ) as slot_no
        from public."SeasonParticipationPendingApply" application
       group by application."seasonId", application."applyDate", application."recruitNo", slot_no
      having count(*) > 1
    ) duplicates`,
  },
  {
    name: "team balance draft roster",
    sql: `select count(*)::bigint as count from (
      select draft.id
        from public."TeamBalanceDraft" draft
        left join public."TeamBalanceDraftPlayer" participant on participant."draftId" = draft.id
        left join public."Player" player on player.id = participant."playerId"
       group by draft.id, draft.title
      having char_length(btrim(draft.title)) not between 1 and 120
          or count(participant.id) <> 10
          or count(distinct participant."playerId") <> 10
          or count(participant.id) filter (where participant.team::text = 'BLUE') <> 5
          or count(participant.id) filter (where participant.team::text = 'RED') <> 5
          or count(distinct (participant.team::text, participant.position::text)) <> 10
          or count(participant.id) filter (where player.id is null) <> 0
          or count(participant.id) filter (
               where char_length(player.nickname || '#' || player.tag) > 96
             ) <> 0
          or count(participant.id) filter (
               where participant."roleType" is not null
                 and upper(participant."roleType") not in ('MAIN', 'SUB', 'AUTO')
             ) <> 0
          or count(participant.id) filter (
               where participant.score::text in ('NaN', 'Infinity', '-Infinity')
                  or participant."baseScore"::text in ('NaN', 'Infinity', '-Infinity')
                  or participant."soloBonus"::text in ('NaN', 'Infinity', '-Infinity')
                  or participant."positionBonus"::text in ('NaN', 'Infinity', '-Infinity')
                  or participant."rolePenalty"::text in ('NaN', 'Infinity', '-Infinity')
             ) <> 0
          or draft."redTotal"::text in ('NaN', 'Infinity', '-Infinity')
          or draft."blueTotal"::text in ('NaN', 'Infinity', '-Infinity')
          or draft.diff::text in ('NaN', 'Infinity', '-Infinity')
          or draft."balanceCost"::text in ('NaN', 'Infinity', '-Infinity')
    ) invalid_drafts`,
  },
  {
    name: "team balance review relationships",
    sql: `select count(*)::bigint as count
            from public."BalanceMatchReview" review
            left join public."TeamBalanceDraft" draft on draft.id = review."draftId"
            left join public."MatchSeries" series on series.id = review."matchSeriesId"
           where (review."draftId" is not null and draft.id is null) or series.id is null`,
  },
  {
    name: "cutover administrator",
    sql: `select case when (
      exists (select 1 from public."TeamBalanceDraft")
      or exists (
        select 1 from public."SeasonParticipationApply"
         where status::text in ('CONFIRMED', 'REJECTED', 'RESERVE')
      )
    ) and (
      ${cutoverActorSql} is null
      or not exists (
        select 1 from auth.user_accounts target where target.id = ${cutoverActorSql}
      )
    ) then 1 else 0 end::bigint as count`,
  },
  {
    name: "MMR profile values and relationships",
    sql: `select count(*)::bigint as count
            from public."PlayerBalanceProfile" profile
            left join public."Player" player on player.id = profile."playerId"
           where profile.id <= 0 or player.id is null or profile."matchesAnalyzed" < 0
              or profile.confidence < 0 or profile.confidence > 1
              or profile."overallMmr" < 1 or profile."overallMmr" > 100
              or profile."topMmr" < 1 or profile."topMmr" > 100
              or profile."jungleMmr" < 1 or profile."jungleMmr" > 100
              or profile."midMmr" < 1 or profile."midMmr" > 100
              or profile."adcMmr" < 1 or profile."adcMmr" > 100
              or profile."supportMmr" < 1 or profile."supportMmr" > 100
              or profile.confidence::text in ('NaN', 'Infinity', '-Infinity')
              or profile."overallMmr"::text in ('NaN', 'Infinity', '-Infinity')
              or profile."topMmr"::text in ('NaN', 'Infinity', '-Infinity')
              or profile."jungleMmr"::text in ('NaN', 'Infinity', '-Infinity')
              or profile."midMmr"::text in ('NaN', 'Infinity', '-Infinity')
              or profile."adcMmr"::text in ('NaN', 'Infinity', '-Infinity')
              or profile."supportMmr"::text in ('NaN', 'Infinity', '-Infinity')`,
  },
  {
    name: "MMR result values and relationships",
    sql: `select count(*)::bigint as count
            from public."PlayerBalanceMatchResult" result
            left join public."MatchSeries" series on series.id = result."matchSeriesId"
            left join public."MatchGame" game
              on game.id = result."gameId" and game."seriesId" = result."matchSeriesId"
            left join public."Player" player on player.id = result."playerId"
           where result.id <= 0 or series.id is null or game.id is null or player.id is null
              or result."expectedScoreBefore" is null
              or result."actualPerformanceScore" is null
              or result.team::text not in ('BLUE', 'RED')
              or result.position::text not in ('TOP', 'JGL', 'MID', 'ADC', 'SUP')
              or round(result."mmrDelta" * 100) not between -600 and 600
              or round(result."positionMmrDelta" * 100) not between -700 and 700
              or result."expectedScoreBefore"::text in ('NaN', 'Infinity', '-Infinity')
              or result."actualPerformanceScore"::text in ('NaN', 'Infinity', '-Infinity')`,
  },
  {
    name: "MMR result game roster",
    sql: `select count(*)::bigint as count from (
      select result."gameId"
        from public."PlayerBalanceMatchResult" result
       group by result."gameId"
      having result."gameId" is null
          or count(*) <> 10
          or count(distinct result."playerId") <> 10
          or count(*) filter (where result.team::text = 'BLUE') <> 5
          or count(*) filter (where result.team::text = 'RED') <> 5
          or count(distinct (result.team::text, result.position::text)) <> 10
    ) invalid_games`,
  },
  {
    name: "V2 prerequisite mappings",
    sql: `select count(*)::bigint as count from (
      select application.id
        from public."SeasonParticipationApply" application
        left join competition.seasons season
          on season.id = pg_temp.klol_legacy_uuid('competition.seasons', application."seasonId")
        left join registry.players player
          on player.id = pg_temp.klol_legacy_uuid('registry.players', application."playerId")
       where season.id is null or player.id is null
      union all
      select application.id
        from public."SeasonParticipationPendingApply" application
        left join competition.seasons season
          on season.id = pg_temp.klol_legacy_uuid('competition.seasons', application."seasonId")
       where season.id is null
      union all
      select participant.id
        from public."TeamBalanceDraftPlayer" participant
        left join registry.players player
          on player.id = pg_temp.klol_legacy_uuid('registry.players', participant."playerId")
       where player.id is null
      union all
      select result.id
        from public."PlayerBalanceMatchResult" result
        left join competition.match_series series
          on series.id = pg_temp.klol_legacy_uuid('competition.match_series', result."matchSeriesId")
        left join competition.match_games game
          on game.id = pg_temp.klol_legacy_uuid('competition.match_games', result."gameId")
        left join registry.players player
          on player.id = pg_temp.klol_legacy_uuid('registry.players', result."playerId")
       where series.id is null or game.id is null or player.id is null
    ) missing_mappings`,
  },
]);

const mmrSourceExists = `exists (select 1 from public."PlayerBalanceProfile")
  or exists (select 1 from public."PlayerBalanceMatchResult")`;

const mmrChecksumSql = `decode(
  md5('v1-mmr:' ||
      (select count(*)::text from public."PlayerBalanceProfile") || ':' ||
      (select count(*)::text from public."PlayerBalanceMatchResult")) ||
  md5('v1-mmr-2:' ||
      (select coalesce(max(id), 0)::text from public."PlayerBalanceProfile") || ':' ||
      (select coalesce(max(id), 0)::text from public."PlayerBalanceMatchResult")),
  'hex'
)`;

export const V1_TEAM_TOOLS_IMPORT_STEPS: readonly ImportStep[] = Object.freeze([
  {
    name: "season-applications",
    sourceCountSql: `/* count:season-applications:source */ select count(*)::bigint as count from (
      select distinct on ("seasonId", "playerId", (("applyDate" at time zone 'UTC') at time zone 'Asia/Seoul')::date, "recruitNo") id
        from public."SeasonParticipationApply"
       order by "seasonId", "playerId", (("applyDate" at time zone 'UTC') at time zone 'Asia/Seoul')::date,
                "recruitNo", "updatedAt" desc, id desc
    ) canonical`,
    targetCountSql: `/* count:season-applications:target */ select count(*)::bigint as count
      from (
        select distinct on ("seasonId", "playerId", (("applyDate" at time zone 'UTC') at time zone 'Asia/Seoul')::date, "recruitNo") *
          from public."SeasonParticipationApply"
         order by "seasonId", "playerId", (("applyDate" at time zone 'UTC') at time zone 'Asia/Seoul')::date,
                  "recruitNo", "updatedAt" desc, id desc
      ) source
      join competition.season_applications target
        on target.id = pg_temp.klol_legacy_uuid('competition.season_applications', source.id)
       and target.legacy_id = source.id`,
    importSql: `/* import:season-applications */
      insert into competition.season_applications (
        id, legacy_id, season_id, player_id, apply_date, recruit_no, source_slot_no,
        main_position, sub_positions, status, source, source_reference_hash,
        review_note, reviewed_by_user_account_id, reviewed_at, cancelled_at,
        revision, created_at, updated_at
      )
      select pg_temp.klol_legacy_uuid('competition.season_applications', source.id), source.id,
             pg_temp.klol_legacy_uuid('competition.seasons', source."seasonId"),
             pg_temp.klol_legacy_uuid('registry.players', source."playerId"),
             ((source."applyDate" at time zone 'UTC') at time zone 'Asia/Seoul')::date,
             source."recruitNo", source."sourceSlotNo",
             source."mainPosition"::text::competition.season_application_position,
             case when source."mainPosition"::text = 'ALL'
               then array[]::competition.season_application_position[]
               else array(select distinct position::text::competition.season_application_position
                     from unnest(source."subPositions") position
                    where position::text not in (source."mainPosition"::text, 'ALL')
                    order by position::text::competition.season_application_position)
             end,
             source.status::text::competition.season_application_status,
             case when source.source = 'SITE' then 'SITE'::competition.season_application_source
                  else 'KAKAO'::competition.season_application_source end,
             case when source.source = 'SITE' then null else decode(lower(source."sourceMessageHash"), 'hex') end,
             null,
             case when source.status::text in ('CONFIRMED', 'REJECTED', 'RESERVE') then ${cutoverActorSql} else null end,
             case when source.status::text in ('CONFIRMED', 'REJECTED', 'RESERVE') then source."updatedAt" at time zone 'UTC' else null end,
             case when source.status::text = 'CANCELLED' then source."updatedAt" at time zone 'UTC' else null end,
             0, source."createdAt" at time zone 'UTC', source."updatedAt" at time zone 'UTC'
        from (
          select distinct on ("seasonId", "playerId", (("applyDate" at time zone 'UTC') at time zone 'Asia/Seoul')::date, "recruitNo") *
            from public."SeasonParticipationApply"
           order by "seasonId", "playerId", (("applyDate" at time zone 'UTC') at time zone 'Asia/Seoul')::date,
                    "recruitNo", "updatedAt" desc, id desc
        ) source
       order by source.id
      on conflict (legacy_id) do nothing`,
  },
  {
    name: "season-kakao-pending-applications",
    sourceCountSql: `/* count:season-kakao-pending-applications:source */ select count(*)::bigint as count from public."SeasonParticipationPendingApply"`,
    targetCountSql: `/* count:season-kakao-pending-applications:target */ select count(*)::bigint as count
      from public."SeasonParticipationPendingApply" source
      join competition.season_kakao_pending_applications target
        on target.id = pg_temp.klol_legacy_uuid('competition.season_kakao_pending_applications', source.id)`,
    importSql: `/* import:season-kakao-pending-applications */
      insert into competition.season_kakao_pending_applications (
        id, season_id, matched_player_id, apply_date, recruit_no, slot_no,
        supplied_name, supplied_riot_id, main_position, sub_positions, reserve,
        match_state, status, source_reference_hash, cancelled_at, resolved_at,
        revision, created_at, updated_at
      )
      select pg_temp.klol_legacy_uuid('competition.season_kakao_pending_applications', source.id),
             pg_temp.klol_legacy_uuid('competition.seasons', source."seasonId"), null,
             ((source."applyDate" at time zone 'UTC') at time zone 'Asia/Seoul')::date,
             source."recruitNo",
             coalesce(case when source."isReserve" then source."reserveSlotNo" else source."sourceSlotNo" end,
                      source."sourceSlotNo", source."reserveSlotNo"),
             btrim(source.name), null,
             source."mainPosition"::text::competition.season_application_position,
             case when source."mainPosition"::text = 'ALL'
               then array[]::competition.season_application_position[]
               else array(select distinct position::text::competition.season_application_position
                     from unnest(source."subPositions") position
                    where position::text not in (source."mainPosition"::text, 'ALL')
                    order by position::text::competition.season_application_position)
             end,
             source."isReserve", 'UNMATCHED'::competition.season_kakao_pending_match_state,
             'ACTIVE'::competition.season_kakao_pending_status,
             decode(lower(source."sourceMessageHash"), 'hex'), null, null, 0,
             source."createdAt" at time zone 'UTC', source."updatedAt" at time zone 'UTC'
        from public."SeasonParticipationPendingApply" source
       order by source.id
      on conflict (id) do nothing`,
  },
  {
    name: "team-balance-drafts",
    sourceCountSql: `/* count:team-balance-drafts:source */ select count(*)::bigint as count from public."TeamBalanceDraft"`,
    targetCountSql: `/* count:team-balance-drafts:target */ select count(*)::bigint as count
      from public."TeamBalanceDraft" source
      join team_tools.team_balance_drafts target
        on target.id = pg_temp.klol_legacy_uuid('team_tools.team_balance_drafts', source.id)
       and target.status::text = 'SAVED'`,
    importSql: `/* import:team-balance-drafts */
      insert into team_tools.team_balance_drafts (
        id, owner_user_account_id, title, status, evaluation_round, rating_generation,
        selected_candidate_source, selected_candidate_signature, revision,
        created_by_user_account_id, updated_by_user_account_id,
        saved_at, archived_at, created_at, updated_at
      )
      select pg_temp.klol_legacy_uuid('team_tools.team_balance_drafts', source.id),
             ${cutoverActorSql}, btrim(source.title), 'SAVED', 1,
             case when ${mmrSourceExists} then ${GENERATION} else null end,
             'MANUAL', 'v1-draft-' || source.id::text, 0,
             ${cutoverActorSql}, ${cutoverActorSql},
             source."updatedAt" at time zone 'UTC', null,
             source."createdAt" at time zone 'UTC', source."updatedAt" at time zone 'UTC'
        from public."TeamBalanceDraft" source
       order by source.id
      on conflict (id) do nothing`,
  },
  {
    name: "team-balance-draft-participants",
    sourceCountSql: `/* count:team-balance-draft-participants:source */ select count(*)::bigint as count from public."TeamBalanceDraftPlayer"`,
    targetCountSql: `/* count:team-balance-draft-participants:target */ select count(*)::bigint as count
      from public."TeamBalanceDraftPlayer" source
      join team_tools.team_balance_draft_participants target
        on target.draft_id = pg_temp.klol_legacy_uuid('team_tools.team_balance_drafts', source."draftId")
       and target.player_id = pg_temp.klol_legacy_uuid('registry.players', source."playerId")`,
    importSql: `/* import:team-balance-draft-participants */
      with ranked as (
        select source.*, row_number() over (partition by source."draftId" order by source.id) - 1 as ordinal
          from public."TeamBalanceDraftPlayer" source
      )
      insert into team_tools.team_balance_draft_participants (
        draft_id, player_id, ordinal, display_name_snapshot,
        eligible_positions_json, rating_snapshot_json, updated_at
      )
      select pg_temp.klol_legacy_uuid('team_tools.team_balance_drafts', source."draftId"),
             pg_temp.klol_legacy_uuid('registry.players', source."playerId"), source.ordinal,
             player.nickname || '#' || player.tag,
             jsonb_build_array(jsonb_build_object(
               'position', source.position::text,
               'preference', case when upper(coalesce(source."roleType", 'AUTO')) in ('MAIN', 'SUB')
                                  then upper(source."roleType") else 'AUTO' end
             )),
             jsonb_build_object(
               'overall', profile."overallMmr",
               'confidence', profile.confidence,
               'sampleSize', profile."matchesAnalyzed",
               'positions', case when profile.id is null then null else jsonb_build_object(
                 'TOP', jsonb_build_object('score', profile."topMmr", 'confidence', profile.confidence, 'sampleSize', profile."matchesAnalyzed"),
                 'JGL', jsonb_build_object('score', profile."jungleMmr", 'confidence', profile.confidence, 'sampleSize', profile."matchesAnalyzed"),
                 'MID', jsonb_build_object('score', profile."midMmr", 'confidence', profile.confidence, 'sampleSize', profile."matchesAnalyzed"),
                 'ADC', jsonb_build_object('score', profile."adcMmr", 'confidence', profile.confidence, 'sampleSize', profile."matchesAnalyzed"),
                 'SUP', jsonb_build_object('score', profile."supportMmr", 'confidence', profile.confidence, 'sampleSize', profile."matchesAnalyzed")
               ) end
             ),
             greatest(source."createdAt", draft."updatedAt") at time zone 'UTC'
        from ranked source
        join public."TeamBalanceDraft" draft on draft.id = source."draftId"
        join public."Player" player on player.id = source."playerId"
        left join public."PlayerBalanceProfile" profile on profile."playerId" = source."playerId"
       order by source."draftId", source.ordinal
      on conflict (draft_id, player_id) do nothing`,
  },
  {
    name: "team-balance-draft-candidates",
    sourceCountSql: `/* count:team-balance-draft-candidates:source */ select count(*)::bigint as count from public."TeamBalanceDraft"`,
    targetCountSql: `/* count:team-balance-draft-candidates:target */ select count(*)::bigint as count
      from public."TeamBalanceDraft" source
      join team_tools.team_balance_draft_candidates target
        on target.id = pg_temp.klol_legacy_uuid('team_tools.team_balance_draft_candidates', source.id)
       and target.draft_id = pg_temp.klol_legacy_uuid('team_tools.team_balance_drafts', source.id)
       and target.signature = 'v1-draft-' || source.id::text`,
    importSql: `/* import:team-balance-draft-candidates */
      insert into team_tools.team_balance_draft_candidates (
        id, draft_id, evaluation_round, source, rank, signature,
        assignments_json, score_json, created_by_user_account_id, created_at
      )
      select pg_temp.klol_legacy_uuid('team_tools.team_balance_draft_candidates', draft.id),
             pg_temp.klol_legacy_uuid('team_tools.team_balance_drafts', draft.id),
             1, 'MANUAL', null, 'v1-draft-' || draft.id::text,
             (
               select jsonb_agg(jsonb_build_object(
                 'playerId', pg_temp.klol_legacy_uuid('registry.players', participant."playerId")::text,
                 'team', participant.team::text,
                 'position', participant.position::text,
                 'preference', case when upper(coalesce(participant."roleType", 'AUTO')) in ('MAIN', 'SUB')
                                    then upper(participant."roleType") else 'AUTO' end,
                 'rating', jsonb_build_object(
                   'source', case when participant.score is not null then 'POSITION'
                                  when participant."baseScore" is not null then 'OVERALL' else 'DEFAULT' end,
                   'rawScore', coalesce(participant."baseScore", participant.score, 50),
                   'effectiveScore', coalesce(participant.score,
                     participant."baseScore" + coalesce(participant."soloBonus", 0) +
                     coalesce(participant."positionBonus", 0) - coalesce(participant."rolePenalty", 0), 50),
                   'confidence', coalesce(profile.confidence, 0),
                   'sampleSize', profile."matchesAnalyzed"
                 )
               ) order by participant.id)
                 from public."TeamBalanceDraftPlayer" participant
                 left join public."PlayerBalanceProfile" profile on profile."playerId" = participant."playerId"
                where participant."draftId" = draft.id
             ),
             jsonb_build_object(
               'teamStrength', jsonb_build_object(
                 'blueTotal', coalesce(draft."blueTotal", (select sum(coalesce(p.score, 50)) from public."TeamBalanceDraftPlayer" p where p."draftId" = draft.id and p.team::text = 'BLUE')),
                 'redTotal', coalesce(draft."redTotal", (select sum(coalesce(p.score, 50)) from public."TeamBalanceDraftPlayer" p where p."draftId" = draft.id and p.team::text = 'RED')),
                 'difference', coalesce(draft.diff, abs(coalesce(draft."blueTotal", 250) - coalesce(draft."redTotal", 250))),
                 'weightedPenalty', coalesce(draft.diff, abs(coalesce(draft."blueTotal", 250) - coalesce(draft."redTotal", 250))) * 100
               ),
               'positions', (select jsonb_agg(jsonb_build_object(
                 'position', slots.position, 'blueScore', slots.blue_score,
                 'redScore', slots.red_score, 'difference', abs(slots.blue_score - slots.red_score)
               ) order by array_position(array['TOP','JGL','MID','ADC','SUP'], slots.position)) from (
                 select p.position::text as position,
                        max(coalesce(p.score, 50)) filter (where p.team::text = 'BLUE') as blue_score,
                        max(coalesce(p.score, 50)) filter (where p.team::text = 'RED') as red_score
                   from public."TeamBalanceDraftPlayer" p where p."draftId" = draft.id group by p.position::text
               ) slots),
               'positionDifferenceTotal', (select sum(abs(slots.blue_score - slots.red_score)) from (
                 select p.position::text,
                        max(coalesce(p.score, 50)) filter (where p.team::text = 'BLUE') as blue_score,
                        max(coalesce(p.score, 50)) filter (where p.team::text = 'RED') as red_score
                   from public."TeamBalanceDraftPlayer" p where p."draftId" = draft.id group by p.position::text
               ) slots),
               'positionWeightedPenalty', (select sum(abs(slots.blue_score - slots.red_score)) * 10 from (
                 select p.position::text,
                        max(coalesce(p.score, 50)) filter (where p.team::text = 'BLUE') as blue_score,
                        max(coalesce(p.score, 50)) filter (where p.team::text = 'RED') as red_score
                   from public."TeamBalanceDraftPlayer" p where p."draftId" = draft.id group by p.position::text
               ) slots),
               'preference', jsonb_build_object(
                 'mainCount', (select count(*) from public."TeamBalanceDraftPlayer" p where p."draftId" = draft.id and upper(p."roleType") = 'MAIN'),
                 'subCount', (select count(*) from public."TeamBalanceDraftPlayer" p where p."draftId" = draft.id and upper(p."roleType") = 'SUB'),
                 'autoCount', (select count(*) from public."TeamBalanceDraftPlayer" p where p."draftId" = draft.id and upper(coalesce(p."roleType", 'AUTO')) = 'AUTO'),
                 'rawPenalty', (select count(*) filter (where upper(p."roleType") = 'SUB') * 3 + count(*) filter (where upper(coalesce(p."roleType", 'AUTO')) = 'AUTO') * 8 from public."TeamBalanceDraftPlayer" p where p."draftId" = draft.id),
                 'weightedPenalty', (select (count(*) filter (where upper(p."roleType") = 'SUB') * 3 + count(*) filter (where upper(coalesce(p."roleType", 'AUTO')) = 'AUTO') * 8) * 100 from public."TeamBalanceDraftPlayer" p where p."draftId" = draft.id)
               ),
               'uncertainty', jsonb_build_object(
                 'averageConfidence', coalesce((select avg(coalesce(profile.confidence, 0)) from public."TeamBalanceDraftPlayer" p left join public."PlayerBalanceProfile" profile on profile."playerId" = p."playerId" where p."draftId" = draft.id), 0),
                 'noSampleCount', (select count(*) filter (where coalesce(profile."matchesAnalyzed", 0) = 0) from public."TeamBalanceDraftPlayer" p left join public."PlayerBalanceProfile" profile on profile."playerId" = p."playerId" where p."draftId" = draft.id),
                 'rawPenalty', 0, 'weightedPenalty', 0
               ),
               'totalPenalty', coalesce(draft."balanceCost", draft.diff * 100, 0),
               'legacy', jsonb_build_object(
                 'seasonId', draft."seasonId", 'applyDate', draft."applyDate",
                 'optionType', draft."optionType", 'formulaVersion', draft."formulaVersion",
                 'isOfficial', draft."isOfficial", 'balanceMatchReviews', ${reviewJsonSql}
               )
             ),
             ${cutoverActorSql}, draft."createdAt" at time zone 'UTC'
        from public."TeamBalanceDraft" draft
       order by draft.id
      on conflict (id) do nothing`,
  },
  {
    name: "mmr-projection-runs",
    sourceCountSql: `/* count:mmr-projection-runs:source */ select case when ${mmrSourceExists} then 1 else 0 end::bigint as count`,
    targetCountSql: `/* count:mmr-projection-runs:target */ select count(*)::bigint as count
      from mmr.projection_runs target
     where ${mmrSourceExists}
       and target.id = pg_temp.klol_legacy_uuid('mmr.projection_runs', 1)
       and target.result_generation = ${GENERATION}
       and target.source_checksum = ${mmrChecksumSql}`,
    importSql: `/* import:mmr-projection-runs */
      insert into mmr.projection_runs (
        id, trigger, actor_user_account_id, base_generation, result_generation,
        source_match_count, source_game_count, source_adjustment_count, source_checksum,
        started_at, completed_at
      )
      select pg_temp.klol_legacy_uuid('mmr.projection_runs', 1), 'BOOTSTRAP', null, 0, ${GENERATION},
             (select count(distinct "matchSeriesId") from public."PlayerBalanceMatchResult"),
             (select count(distinct "gameId") from public."PlayerBalanceMatchResult"),
             0, ${mmrChecksumSql},
             coalesce((select min("createdAt") at time zone 'UTC' from public."PlayerBalanceMatchResult"),
                      (select min("createdAt") at time zone 'UTC' from public."PlayerBalanceProfile")),
             coalesce((select max("createdAt") at time zone 'UTC' from public."PlayerBalanceMatchResult"),
                      (select max("lastUpdatedAt") at time zone 'UTC' from public."PlayerBalanceProfile"))
       where ${mmrSourceExists}
      on conflict (result_generation) do nothing`,
  },
  {
    name: "mmr-projection-states",
    sourceCountSql: `/* count:mmr-projection-states:source */ select case when ${mmrSourceExists} then 1 else 0 end::bigint as count`,
    targetCountSql: `/* count:mmr-projection-states:target */ select count(*)::bigint as count
      from mmr.projection_states target
     where ${mmrSourceExists} and target.key = 'GLOBAL' and target.generation = ${GENERATION}
       and target.formula_version = '${FORMULA_VERSION}' and target.source_checksum = ${mmrChecksumSql}`,
    importSql: `/* import:mmr-projection-states */
      insert into mmr.projection_states (
        key, generation, status, formula_version, source_match_count, source_game_count,
        source_adjustment_count, source_checksum, calculated_at, created_at, updated_at
      )
      select 'GLOBAL', ${GENERATION}, 'READY', '${FORMULA_VERSION}',
             (select count(distinct "matchSeriesId") from public."PlayerBalanceMatchResult"),
             (select count(distinct "gameId") from public."PlayerBalanceMatchResult"),
             0, ${mmrChecksumSql},
             coalesce((select max("createdAt") at time zone 'UTC' from public."PlayerBalanceMatchResult"),
                      (select max("lastUpdatedAt") at time zone 'UTC' from public."PlayerBalanceProfile")),
             coalesce((select min("createdAt") at time zone 'UTC' from public."PlayerBalanceMatchResult"),
                      (select min("createdAt") at time zone 'UTC' from public."PlayerBalanceProfile")),
             coalesce((select max("createdAt") at time zone 'UTC' from public."PlayerBalanceMatchResult"),
                      (select max("lastUpdatedAt") at time zone 'UTC' from public."PlayerBalanceProfile"))
       where ${mmrSourceExists}
      on conflict (key) do nothing`,
  },
  {
    name: "mmr-player-profiles",
    sourceCountSql: `/* count:mmr-player-profiles:source */ select count(*)::bigint as count from public."PlayerBalanceProfile"`,
    targetCountSql: `/* count:mmr-player-profiles:target */ select count(*)::bigint as count
      from public."PlayerBalanceProfile" source
      join mmr.player_profiles target
        on target.generation = ${GENERATION}
       and target.player_id = pg_temp.klol_legacy_uuid('registry.players', source."playerId")
       and target.overall_score_bp = round(source."overallMmr" * 100)
       and target.confidence_bp = round(source.confidence * 10000)
       and target.sample_size = source."matchesAnalyzed"`,
    importSql: `/* import:mmr-player-profiles */
      insert into mmr.player_profiles (
        generation, player_id, overall_score_bp, confidence_bp, sample_size,
        formula_version, calculated_at
      )
      select ${GENERATION}, pg_temp.klol_legacy_uuid('registry.players', source."playerId"),
             round(source."overallMmr" * 100), round(source.confidence * 10000),
             source."matchesAnalyzed", '${FORMULA_VERSION}', source."lastUpdatedAt" at time zone 'UTC'
        from public."PlayerBalanceProfile" source
       order by source."playerId"
      on conflict (generation, player_id) do nothing`,
  },
  {
    name: "mmr-player-position-profiles",
    sourceCountSql: `/* count:mmr-player-position-profiles:source */ select count(*) * 5::bigint as count from public."PlayerBalanceProfile"`,
    targetCountSql: `/* count:mmr-player-position-profiles:target */ select count(*)::bigint as count from (
      select source."playerId", rating.position
        from public."PlayerBalanceProfile" source
        cross join lateral (values
          ('TOP', source."topMmr"), ('JGL', source."jungleMmr"), ('MID', source."midMmr"),
          ('ADC', source."adcMmr"), ('SUP', source."supportMmr")
        ) rating(position, score)
        join mmr.player_position_profiles target
          on target.generation = ${GENERATION}
         and target.player_id = pg_temp.klol_legacy_uuid('registry.players', source."playerId")
         and target.position::text = rating.position
         and target.score_bp = round(rating.score * 100)
         and target.sample_size = source."matchesAnalyzed"
    ) matched`,
    importSql: `/* import:mmr-player-position-profiles */
      insert into mmr.player_position_profiles (
        generation, player_id, position, score_bp, sample_size, calculated_at
      )
      select ${GENERATION}, pg_temp.klol_legacy_uuid('registry.players', source."playerId"),
             rating.position::competition.match_position, round(rating.score * 100),
             source."matchesAnalyzed", source."lastUpdatedAt" at time zone 'UTC'
        from public."PlayerBalanceProfile" source
        cross join lateral (values
          ('TOP', source."topMmr"), ('JGL', source."jungleMmr"), ('MID', source."midMmr"),
          ('ADC', source."adcMmr"), ('SUP', source."supportMmr")
        ) rating(position, score)
       order by source."playerId", rating.position
      on conflict (generation, player_id, position) do nothing`,
  },
  {
    name: "mmr-match-result-events",
    sourceCountSql: `/* count:mmr-match-result-events:source */ select count(*)::bigint as count from public."PlayerBalanceMatchResult"`,
    targetCountSql: `/* count:mmr-match-result-events:target */ select count(*)::bigint as count
      from public."PlayerBalanceMatchResult" source
      join mmr.match_result_events target
        on target.id = pg_temp.klol_legacy_uuid('mmr.match_result_events', source.id)
       and target.generation = ${GENERATION}
       and target.game_id = pg_temp.klol_legacy_uuid('competition.match_games', source."gameId")
       and target.player_id = pg_temp.klol_legacy_uuid('registry.players', source."playerId")`,
    importSql: `/* import:mmr-match-result-events */
      with totals as (
        select result."gameId",
               sum(result."expectedScoreBefore") filter (where result.team::text = 'BLUE') as blue_total,
               sum(result."expectedScoreBefore") filter (where result.team::text = 'RED') as red_total
          from public."PlayerBalanceMatchResult" result
         group by result."gameId"
      )
      insert into mmr.match_result_events (
        id, generation, source_event_id, match_id, game_id, game_number, player_id,
        team, position, won, expected_win_rate_bp, actual_performance_bp,
        overall_delta_bp, position_delta_bp, formula_version, created_at
      )
      select pg_temp.klol_legacy_uuid('mmr.match_result_events', source.id), ${GENERATION},
             pg_temp.klol_legacy_uuid('competition.match_series', source."matchSeriesId"),
             pg_temp.klol_legacy_uuid('competition.match_series', source."matchSeriesId"),
             pg_temp.klol_legacy_uuid('competition.match_games', source."gameId"), game."gameNumber",
             pg_temp.klol_legacy_uuid('registry.players', source."playerId"),
             source.team::text, source.position::text::competition.match_position, source.win,
             greatest(1, least(9999, round(10000 / (1 + power(10,
               (case when source.team::text = 'BLUE' then totals.red_total - totals.blue_total
                     else totals.blue_total - totals.red_total end) / 40
             )))))::integer,
             round(source."actualPerformanceScore" * 100),
             round(source."mmrDelta" * 100), round(source."positionMmrDelta" * 100),
             '${FORMULA_VERSION}', source."createdAt" at time zone 'UTC'
        from public."PlayerBalanceMatchResult" source
        join public."MatchGame" game on game.id = source."gameId"
        join totals on totals."gameId" = source."gameId"
       order by source.id
      on conflict (id) do nothing`,
  },
]);

function safeCount(value: string | number | undefined, label: string): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(value ?? "", 10);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`${label} returned an invalid count.`);
  return parsed;
}

async function count(client: CutoverClient, sql: string, label: string): Promise<number> {
  const result = await client.query<CountRow>(sql);
  return safeCount(result.rows[0]?.count, label);
}

async function assertIntegrity(client: CutoverClient): Promise<void> {
  for (const check of integrityChecks) {
    const problems = await count(client, `/* integrity:${check.name} */ ${check.sql}`, check.name);
    if (problems !== 0) {
      throw new Error(`V1 team tools import blocked by ${check.name}: ${problems} problem row(s).`);
    }
  }
}

export const importV1TeamTools: CutoverPhase = async (
  client: CutoverClient,
): Promise<readonly CutoverStepResult[]> => {
  await assertIntegrity(client);
  const results: CutoverStepResult[] = [];

  for (const step of V1_TEAM_TOOLS_IMPORT_STEPS) {
    const sourceCount = await count(client, step.sourceCountSql, `${step.name} source`);
    const beforeCount = await count(client, step.targetCountSql, `${step.name} target before import`);
    await client.query(step.importSql);
    const targetCount = await count(client, step.targetCountSql, `${step.name} target after import`);

    if (targetCount !== sourceCount) {
      throw new Error(`${step.name} reconciliation failed: source=${sourceCount}, target=${targetCount}.`);
    }
    if (targetCount < beforeCount) {
      throw new Error(`${step.name} target count decreased inside the import transaction.`);
    }

    results.push({ name: step.name, sourceCount, targetCount, insertedCount: targetCount - beforeCount });
  }

  return Object.freeze(results);
};
