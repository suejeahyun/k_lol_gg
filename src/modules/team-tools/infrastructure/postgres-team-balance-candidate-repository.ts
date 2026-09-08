import { and, asc, desc, eq, gte, inArray, like, or, sql } from "drizzle-orm";

import { kstDateKey, type SeasonApplicationSource } from "@/modules/seasons";
import { players } from "@/platform/db/schema/registry";
import { seasonApplications, seasons } from "@/platform/db/schema/seasons";
import type { V2Database } from "@/platform/db/database";

import type {
  TeamBalanceCandidateGroup,
  TeamBalanceCandidateGroups,
  TeamBalanceCandidateRepository,
  TeamBalancePlayerSearch,
} from "../application/ports/team-balance-candidate-repository";

const MAXIMUM_CANDIDATES = 500;
const MAXIMUM_PLAYER_RESULTS = 50;

function normalizedIdentity(value: string) {
  return value.trim().normalize("NFKC").toLocaleLowerCase("ko-KR");
}

function escapeLikePrefix(value: string) {
  return `${value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
}

function firstKstDate(now: Date, days: number) {
  const today = kstDateKey(now);
  const first = new Date(`${today}T00:00:00+09:00`);
  first.setUTCDate(first.getUTCDate() - (days - 1));
  return kstDateKey(first);
}

export class PostgresTeamBalanceCandidateRepository implements TeamBalanceCandidateRepository {
  constructor(private readonly database: V2Database) {}

  async searchPlayers(query: string): Promise<TeamBalancePlayerSearch> {
    const normalized = normalizedIdentity(query);
    const prefix = escapeLikePrefix(normalized);
    const normalizedRiotId = sql<string>`${players.nicknameNormalized} || '#' || ${players.tagLineNormalized}`;
    const rows = await this.database
      .select({
        playerId: players.id,
        displayName: players.memberName,
        nickname: players.nickname,
        tagLine: players.tagLine,
      })
      .from(players)
      .where(and(
        eq(players.status, "ACTIVE"),
        or(
          like(players.memberNameNormalized, prefix),
          like(players.nicknameNormalized, prefix),
          like(normalizedRiotId, prefix),
        ),
      ))
      .orderBy(asc(players.memberNameNormalized), asc(players.nicknameNormalized), asc(players.id))
      .limit(MAXIMUM_PLAYER_RESULTS + 1);

    return {
      players: rows.slice(0, MAXIMUM_PLAYER_RESULTS).map((row) => ({
        playerId: row.playerId,
        displayName: row.displayName,
        riotId: `${row.nickname}#${row.tagLine}`,
      })),
      hasMore: rows.length > MAXIMUM_PLAYER_RESULTS,
    };
  }

  async listSeasonGroups(input: Readonly<{
    origin: "ALL" | SeasonApplicationSource;
    days: number;
    now: Date;
  }>): Promise<TeamBalanceCandidateGroups> {
    const activeSeason = (await this.database
      .select({ id: seasons.id, name: seasons.name })
      .from(seasons)
      .where(eq(seasons.status, "ACTIVE"))
      .limit(1))[0];
    if (!activeSeason) return { groups: [], truncated: false };

    const rows = await this.database
      .select({
        application: seasonApplications,
        displayName: players.memberName,
        nickname: players.nickname,
        tagLine: players.tagLine,
      })
      .from(seasonApplications)
      .innerJoin(players, eq(players.id, seasonApplications.playerId))
      .where(and(
        eq(seasonApplications.seasonId, activeSeason.id),
        gte(seasonApplications.applyDate, firstKstDate(input.now, input.days)),
        inArray(seasonApplications.status, ["APPLIED", "CONFIRMED"]),
        eq(players.status, "ACTIVE"),
        input.origin === "ALL" ? undefined : eq(seasonApplications.source, input.origin),
      ))
      .orderBy(
        desc(seasonApplications.applyDate),
        asc(seasonApplications.recruitNo),
        asc(seasonApplications.sourceSlotNo),
        asc(seasonApplications.createdAt),
        asc(seasonApplications.id),
      )
      .limit(MAXIMUM_CANDIDATES + 1);

    const groups = new Map<string, {
      seasonId: string;
      seasonName: string;
      applyDate: string;
      recruitNo: number;
      sources: Set<SeasonApplicationSource>;
      players: TeamBalanceCandidateGroup["players"][number][];
    }>();

    for (const row of rows.slice(0, MAXIMUM_CANDIDATES)) {
      const key = `${row.application.applyDate}:${row.application.recruitNo}`;
      const group = groups.get(key) ?? {
        seasonId: activeSeason.id,
        seasonName: activeSeason.name,
        applyDate: row.application.applyDate,
        recruitNo: row.application.recruitNo,
        sources: new Set<SeasonApplicationSource>(),
        players: [],
      };
      group.sources.add(row.application.source);
      group.players.push({
        playerId: row.application.playerId,
        displayName: row.displayName,
        riotId: `${row.nickname}#${row.tagLine}`,
        mainPosition: row.application.mainPosition,
        subPositions: row.application.subPositions,
        source: row.application.source,
      });
      groups.set(key, group);
    }

    return {
      groups: [...groups.entries()].map(([key, group]) => ({
        key,
        seasonId: group.seasonId,
        seasonName: group.seasonName,
        applyDate: group.applyDate,
        recruitNo: group.recruitNo,
        sources: [...group.sources].sort(),
        players: group.players,
      })),
      truncated: rows.length > MAXIMUM_CANDIDATES,
    };
  }
}
