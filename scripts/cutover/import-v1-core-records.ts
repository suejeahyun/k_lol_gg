import type { QueryResultRow } from "pg";

import type { CutoverClient, CutoverPhase, CutoverStepResult } from "./types";

type CountRow = QueryResultRow & Readonly<{ count: string | number }>;

type ImportStep = Readonly<{
  name: string;
  sourceCountSql: string;
  targetCountSql: string;
  importSql: string;
}>;

const integrityChecks = Object.freeze([
  {
    name: "active season cardinality",
    sql: `select greatest(count(*) - 1, 0)::bigint as count
            from public."Season"
           where "isActive"`,
  },
  {
    name: "season normalized-name uniqueness",
    sql: `select count(*)::bigint as count
            from (
              select lower(btrim(name))
                from public."Season"
               group by lower(btrim(name))
              having count(*) > 1
            ) duplicate_names`,
  },
  {
    name: "core source scalar validity",
    sql: `select count(*)::bigint as count
            from (
              select id from public."Champion"
               where char_length(btrim(name)) not between 1 and 100
                  or "imageUrl" is null
                  or "imageUrl" !~ '^https://ddragon\\.leagueoflegends\\.com/cdn/[0-9]+\\.[0-9]+\\.[0-9]+/img/champion/[A-Za-z0-9]+\\.png$'
              union all
              select id from public."Season" where char_length(btrim(name)) not between 1 and 120
              union all
              select id from public."MatchSeries" where char_length(btrim(title)) not between 1 and 160
              union all
              select id from public."MatchGame" where "gameNumber" not between 1 and 9 or "durationMin" not between 0 and 120
              union all
              select id from public."MatchParticipant"
               where kills not between 0 and 999 or deaths not between 0 and 999 or assists not between 0 and 999
            ) invalid_rows`,
  },
  {
    name: "match series game cardinality",
    sql: `select count(*)::bigint as count
            from (
              select series.id
                from public."MatchSeries" series
                left join public."MatchGame" game on game."seriesId" = series.id
               group by series.id
              having count(game.id) not between 1 and 9
            ) invalid_series`,
  },
  {
    name: "match game roster cardinality",
    sql: `select count(*)::bigint as count
            from (
              select game.id
                from public."MatchGame" game
                left join public."MatchParticipant" participant on participant."gameId" = game.id
               group by game.id
              having count(participant.id) <> 10
            ) invalid_games`,
  },
  {
    name: "match game roster uniqueness",
    sql: `select count(*)::bigint as count
            from (
              select "gameId" from public."MatchParticipant" group by "gameId", "playerId" having count(*) > 1
              union all
              select "gameId" from public."MatchParticipant" group by "gameId", "championId" having count(*) > 1
              union all
              select "gameId" from public."MatchParticipant" group by "gameId", team, position having count(*) > 1
            ) duplicate_slots`,
  },
  {
    name: "match game winner roster",
    sql: `select count(*)::bigint as count
            from public."MatchGame" game
           where not exists (
             select 1 from public."MatchParticipant" participant
              where participant."gameId" = game.id and participant.team::text = game."winnerTeam"::text
           )`,
  },
  {
    name: "statistics scalar validity",
    sql: `select count(*)::bigint as count
            from (
              select id from public."PlayerSeasonStat"
               where "totalGames" < 0 or "participationCount" < 0 or wins < 0 or losses < 0 or "mvpCount" < 0
                  or wins + losses <> "totalGames" or "participationCount" > "totalGames" or "mvpCount" > "totalGames"
              union all
              select id from public."PlayerChampionStat"
               where games < 0 or wins < 0 or wins > games or "mvpCount" < 0 or "mvpCount" > games
              union all
              select id from public."PlayerPositionStat"
               where games < 0 or wins < 0 or wins > games
            ) invalid_stats`,
  },
  {
    name: "registry player mapping",
    sql: `select count(*)::bigint as count
            from public."Player" source
            left join registry.players target on target.id = pg_temp.klol_legacy_uuid('registry.players', source.id)
           where target.id is null or target.legacy_id is distinct from source.id`,
  },
]);

export const V1_CORE_RECORD_IMPORT_STEPS: readonly ImportStep[] = Object.freeze([
  {
    name: "champions",
    sourceCountSql: `/* count:champions:source */ select count(*)::bigint as count from public."Champion"`,
    targetCountSql: `/* count:champions:target */ select count(*)::bigint as count
                       from public."Champion" source
                       join catalog.champions target
                         on target.key = 'v1-' || source.id::text
                        and target.display_name = btrim(source.name)
                        and target.image_url = source."imageUrl"`,
    importSql: `/* import:champions */
      insert into catalog.champions (key, display_name, image_url, status, revision, created_at, updated_at)
      select 'v1-' || id::text, btrim(name), "imageUrl", 'ACTIVE', 0, "createdAt", "createdAt"
        from public."Champion"
      on conflict (key) do nothing`,
  },
  {
    name: "seasons",
    sourceCountSql: `/* count:seasons:source */ select count(*)::bigint as count from public."Season"`,
    targetCountSql: `/* count:seasons:target */ select count(*)::bigint as count
                       from public."Season" source
                       join competition.seasons target
                         on target.id = pg_temp.klol_legacy_uuid('competition.seasons', source.id)
                        and target.legacy_id = source.id`,
    importSql: `/* import:seasons */
      insert into competition.seasons (
        id, legacy_id, name, name_normalized, status,
        applications_open_at, applications_close_at, starts_at, ends_at,
        cloned_from_season_id, revision, created_by_user_account_id, updated_by_user_account_id,
        activated_at, ended_at, retired_at, created_at, updated_at
      )
      select pg_temp.klol_legacy_uuid('competition.seasons', id), id, btrim(name), lower(btrim(name)),
             case when "isActive" then 'ACTIVE'::competition.season_status else 'ENDED'::competition.season_status end,
             null, null, "createdAt" at time zone 'UTC', null, null, 0, null, null,
             "createdAt" at time zone 'UTC',
             case when "isActive" then null else "createdAt" at time zone 'UTC' end,
             null, "createdAt" at time zone 'UTC', "createdAt" at time zone 'UTC'
        from public."Season"
      on conflict (id) do nothing`,
  },
  {
    name: "match-series",
    sourceCountSql: `/* count:match-series:source */ select count(*)::bigint as count from public."MatchSeries"`,
    targetCountSql: `/* count:match-series:target */ select count(*)::bigint as count
                       from public."MatchSeries" source
                       join competition.match_series target
                         on target.id = pg_temp.klol_legacy_uuid('competition.match_series', source.id)
                        and target.legacy_id = source.id`,
    importSql: `/* import:match-series */
      insert into competition.match_series (
        id, legacy_id, season_id, team_balance_draft_id, title, title_normalized,
        played_on, started_at, started_at_offset_minutes, blue_wins, red_wins, game_count,
        status, void_reason, voided_at, revision, created_by_user_account_id,
        updated_by_user_account_id, published_at, created_at, updated_at
      )
      select pg_temp.klol_legacy_uuid('competition.match_series', series.id), series.id,
             pg_temp.klol_legacy_uuid('competition.seasons', series."seasonId"), null,
             btrim(series.title), lower(btrim(series.title)),
             ((series."matchDate" at time zone 'UTC') at time zone 'Asia/Seoul')::date,
             series."matchDate" at time zone 'UTC', 540,
             count(*) filter (where game."winnerTeam"::text = 'BLUE')::integer,
             count(*) filter (where game."winnerTeam"::text = 'RED')::integer,
             count(game.id)::integer, 'PUBLISHED', null, null, 0, null, null,
             series."createdAt" at time zone 'UTC', series."createdAt" at time zone 'UTC', series."createdAt" at time zone 'UTC'
        from public."MatchSeries" series
        join public."MatchGame" game on game."seriesId" = series.id
       group by series.id, series."seasonId", series.title, series."matchDate", series."createdAt"
      on conflict (id) do nothing`,
  },
  {
    name: "match-games",
    sourceCountSql: `/* count:match-games:source */ select count(*)::bigint as count from public."MatchGame"`,
    targetCountSql: `/* count:match-games:target */ select count(*)::bigint as count
                       from public."MatchGame" source
                       join competition.match_games target
                         on target.id = pg_temp.klol_legacy_uuid('competition.match_games', source.id)`,
    importSql: `/* import:match-games */
      with scored as (
        select participant."gameId", participant."playerId", participant.kills, participant.deaths, participant.assists,
               participant.kills * 6 + participant.assists * 3 - participant.deaths * 4 + 10 as score_units_2,
               row_number() over (
                 partition by participant."gameId"
                 order by participant.kills * 6 + participant.assists * 3 - participant.deaths * 4 + 10 desc,
                          participant.kills desc, participant.deaths asc, participant.assists desc, participant."playerId" asc
               ) as winner_rank
          from public."MatchParticipant" participant
          join public."MatchGame" game on game.id = participant."gameId"
         where participant.team::text = game."winnerTeam"::text
      )
      insert into competition.match_games (
        id, series_id, game_number, duration_seconds, winner_team, mvp_player_id,
        mvp_score_units_2, mvp_formula_version, mvp_selection, revision, created_at, updated_at
      )
      select pg_temp.klol_legacy_uuid('competition.match_games', game.id),
             pg_temp.klol_legacy_uuid('competition.match_series', game."seriesId"), game."gameNumber",
             greatest(game."durationMin", 1) * 60, game."winnerTeam"::text::competition.match_team,
             pg_temp.klol_legacy_uuid('registry.players', winner."playerId"), winner.score_units_2,
             'V1_COMPAT_1', 'WINNER_SCORE_KDA_PLAYER_ID_V1', 0,
             series."createdAt" at time zone 'UTC', series."createdAt" at time zone 'UTC'
        from public."MatchGame" game
        join public."MatchSeries" series on series.id = game."seriesId"
        join scored winner on winner."gameId" = game.id and winner.winner_rank = 1
      on conflict (id) do nothing`,
  },
  {
    name: "match-participants",
    sourceCountSql: `/* count:match-participants:source */ select count(*)::bigint as count from public."MatchParticipant"`,
    targetCountSql: `/* count:match-participants:target */ select count(*)::bigint as count
                       from public."MatchParticipant" source
                       join competition.match_participants target
                         on target.id = pg_temp.klol_legacy_uuid('competition.match_participants', source.id)`,
    importSql: `/* import:match-participants */
      insert into competition.match_participants (
        id, game_id, player_id, nickname_snapshot, tag_line_snapshot, champion_key,
        team, position, kills, deaths, assists, mvp_score_units_2, mvp_formula_version,
        created_at, updated_at
      )
      select pg_temp.klol_legacy_uuid('competition.match_participants', participant.id),
             pg_temp.klol_legacy_uuid('competition.match_games', participant."gameId"),
             pg_temp.klol_legacy_uuid('registry.players', participant."playerId"),
             player.nickname, player.tag, 'v1-' || participant."championId"::text,
             participant.team::text::competition.match_team,
             participant.position::text::competition.match_position,
             participant.kills, participant.deaths, participant.assists,
             participant.kills * 6 + participant.assists * 3 - participant.deaths * 4 + 10,
             'V1_COMPAT_1', series."createdAt" at time zone 'UTC', series."createdAt" at time zone 'UTC'
        from public."MatchParticipant" participant
        join public."Player" player on player.id = participant."playerId"
        join public."MatchGame" game on game.id = participant."gameId"
        join public."MatchSeries" series on series.id = game."seriesId"
      on conflict (id) do nothing`,
  },
  {
    name: "player-season-statistics",
    sourceCountSql: `/* count:player-season-statistics:source */ select count(*)::bigint as count from public."PlayerSeasonStat"`,
    targetCountSql: `/* count:player-season-statistics:target */ select count(*)::bigint as count
                       from public."PlayerSeasonStat" source
                       join statistics.player_season_stats target
                         on target.season_id = pg_temp.klol_legacy_uuid('competition.seasons', source."seasonId")
                        and target.player_id = pg_temp.klol_legacy_uuid('registry.players', source."playerId")`,
    importSql: `/* import:player-season-statistics */
      insert into statistics.player_season_stats (
        season_id, player_id, generation, total_games, participation_count,
        wins, losses, mvp_count, calculated_at
      )
      select pg_temp.klol_legacy_uuid('competition.seasons', stat."seasonId"),
             pg_temp.klol_legacy_uuid('registry.players', stat."playerId"), 1,
             stat."totalGames", stat."participationCount", stat.wins, stat.losses,
             stat."mvpCount", season."createdAt" at time zone 'UTC'
        from public."PlayerSeasonStat" stat
        join public."Season" season on season.id = stat."seasonId"
      on conflict (season_id, player_id) do nothing`,
  },
  {
    name: "player-champion-statistics",
    sourceCountSql: `/* count:player-champion-statistics:source */ select count(*)::bigint as count from public."PlayerChampionStat"`,
    targetCountSql: `/* count:player-champion-statistics:target */ select count(*)::bigint as count
                       from public."PlayerChampionStat" source
                       join statistics.player_champion_stats target
                         on target.season_id = pg_temp.klol_legacy_uuid('competition.seasons', source."seasonId")
                        and target.player_id = pg_temp.klol_legacy_uuid('registry.players', source."playerId")
                        and target.champion_key = 'v1-' || source."championId"::text`,
    importSql: `/* import:player-champion-statistics */
      insert into statistics.player_champion_stats (
        season_id, player_id, champion_key, generation, games, wins, losses, mvp_count, calculated_at
      )
      select pg_temp.klol_legacy_uuid('competition.seasons', stat."seasonId"),
             pg_temp.klol_legacy_uuid('registry.players', stat."playerId"), 'v1-' || stat."championId"::text,
             1, stat.games, stat.wins, stat.games - stat.wins, stat."mvpCount",
             season."createdAt" at time zone 'UTC'
        from public."PlayerChampionStat" stat
        join public."Season" season on season.id = stat."seasonId"
      on conflict (season_id, player_id, champion_key) do nothing`,
  },
  {
    name: "player-position-statistics",
    sourceCountSql: `/* count:player-position-statistics:source */ select count(*)::bigint as count from public."PlayerPositionStat"`,
    targetCountSql: `/* count:player-position-statistics:target */ select count(*)::bigint as count
                       from public."PlayerPositionStat" source
                       join statistics.player_position_stats target
                         on target.season_id = pg_temp.klol_legacy_uuid('competition.seasons', source."seasonId")
                        and target.player_id = pg_temp.klol_legacy_uuid('registry.players', source."playerId")
                        and target.position::text = source.position::text`,
    importSql: `/* import:player-position-statistics */
      insert into statistics.player_position_stats (
        season_id, player_id, position, generation, games, wins, losses, calculated_at
      )
      select pg_temp.klol_legacy_uuid('competition.seasons', stat."seasonId"),
             pg_temp.klol_legacy_uuid('registry.players', stat."playerId"),
             stat.position::text::competition.match_position, 1,
             stat.games, stat.wins, stat.games - stat.wins, season."createdAt" at time zone 'UTC'
        from public."PlayerPositionStat" stat
        join public."Season" season on season.id = stat."seasonId"
      on conflict (season_id, player_id, position) do nothing`,
  },
  {
    name: "statistics-projection-states",
    sourceCountSql: `/* count:statistics-projection-states:source */ select count(*)::bigint as count from public."Season"`,
    targetCountSql: `/* count:statistics-projection-states:target */ select count(*)::bigint as count
                       from public."Season" source
                       join statistics.season_projection_states target
                         on target.season_id = pg_temp.klol_legacy_uuid('competition.seasons', source.id)`,
    importSql: `/* import:statistics-projection-states */
      insert into statistics.season_projection_states (
        season_id, generation, status, source_match_count, source_game_count,
        source_participant_count, source_checksum, calculated_at, created_at, updated_at
      )
      select pg_temp.klol_legacy_uuid('competition.seasons', season.id), 1, 'READY',
             count(distinct series.id)::integer, count(distinct game.id)::integer,
             count(participant.id)::integer,
             decode(
               md5('v1-core:' || season.id::text || ':' || count(distinct series.id)::text || ':' || count(distinct game.id)::text || ':' || count(participant.id)::text) ||
               md5('v1-core-2:' || season.id::text || ':' || count(distinct series.id)::text || ':' || count(distinct game.id)::text || ':' || count(participant.id)::text),
               'hex'
             ),
             coalesce(max(series."createdAt") at time zone 'UTC', season."createdAt" at time zone 'UTC'),
             season."createdAt" at time zone 'UTC',
             coalesce(max(series."createdAt") at time zone 'UTC', season."createdAt" at time zone 'UTC')
        from public."Season" season
        left join public."MatchSeries" series on series."seasonId" = season.id
        left join public."MatchGame" game on game."seriesId" = series.id
        left join public."MatchParticipant" participant on participant."gameId" = game.id
       group by season.id, season."createdAt"
      on conflict (season_id) do nothing`,
  },
]);

function safeCount(value: string | number | undefined, label: string): number {
  const count = typeof value === "number" ? value : Number.parseInt(value ?? "", 10);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error(`${label} returned an invalid count.`);
  return count;
}

async function count(client: CutoverClient, sql: string, label: string): Promise<number> {
  const result = await client.query<CountRow>(sql);
  return safeCount(result.rows[0]?.count, label);
}

async function assertIntegrity(client: CutoverClient): Promise<void> {
  for (const check of integrityChecks) {
    const problems = await count(client, `/* integrity:${check.name} */ ${check.sql}`, check.name);
    if (problems !== 0) throw new Error(`V1 core import blocked by ${check.name}: ${problems} problem row(s).`);
  }
}

export const importV1CoreRecords: CutoverPhase = async (
  client: CutoverClient,
): Promise<readonly CutoverStepResult[]> => {
  await assertIntegrity(client);
  const results: CutoverStepResult[] = [];

  for (const step of V1_CORE_RECORD_IMPORT_STEPS) {
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

    results.push({
      name: step.name,
      sourceCount,
      targetCount,
      insertedCount: targetCount - beforeCount,
    });
  }

  return Object.freeze(results);
};
