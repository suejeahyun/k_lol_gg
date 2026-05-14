import { prisma } from "@/lib/prisma/client";
import type { KakaoPlayerRecordSummary } from "@/lib/kakao/formatPlayerRecordMessage";

type PlayerRow = {
  id: number;
  name: string | null;
  nickname: string;
  tag: string;
  currentTier: string | null;
  peakTier: string | null;
};

type SeasonRow = {
  id: number;
  name: string;
};

type StatRow = {
  totalGames: bigint | number | null;
  participationCount: bigint | number | null;
  wins: bigint | number | null;
  losses: bigint | number | null;
  kills: bigint | number | null;
  deaths: bigint | number | null;
  assists: bigint | number | null;
  mvpCount: bigint | number | null;
};

type RecentGameRow = {
  title: string | null;
  gameNumber: number | null;
  result: "WIN" | "LOSE" | "UNKNOWN" | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  championName: string | null;
  createdAt: Date | string | null;
};

type RankingRow = {
  nickname: string;
  tag: string;
  totalGames: bigint | number | null;
  wins: bigint | number | null;
  kills: bigint | number | null;
  deaths: bigint | number | null;
  assists: bigint | number | null;
};

function toNumber(value: bigint | number | null | undefined) {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  return 0;
}

function parseNicknameTag(query: string) {
  const trimmed = query.trim();
  const [nickname, ...tagParts] = trimmed.split("#");
  const tag = tagParts.join("#");

  return {
    raw: trimmed,
    nickname: nickname?.trim() ?? "",
    tag: tag?.trim() ?? "",
    hasTag: trimmed.includes("#") && Boolean(nickname?.trim()) && Boolean(tag?.trim()),
  };
}

function getBaseUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  return "http://localhost:3000";
}

export async function getPlayerRecordForKakao(query: string): Promise<KakaoPlayerRecordSummary | null> {
  const parsed = parseNicknameTag(query);

  if (!parsed.raw) return null;

  const players = parsed.hasTag
    ? await prisma.$queryRaw<PlayerRow[]>`
        SELECT id, name, nickname, tag, "currentTier", "peakTier"
        FROM "Player"
        WHERE LOWER(nickname) = LOWER(${parsed.nickname})
          AND LOWER(tag) = LOWER(${parsed.tag})
        LIMIT 1
      `
    : await prisma.$queryRaw<PlayerRow[]>`
        SELECT id, name, nickname, tag, "currentTier", "peakTier"
        FROM "Player"
        WHERE LOWER(nickname) = LOWER(${parsed.raw})
           OR LOWER(name) = LOWER(${parsed.raw})
        ORDER BY id ASC
        LIMIT 1
      `;

  const player = players[0];
  if (!player) return null;

  const seasons = await prisma.$queryRaw<SeasonRow[]>`
    SELECT id, name
    FROM "Season"
    WHERE "isActive" = true
    ORDER BY id DESC
    LIMIT 1
  `;
  const season = seasons[0] ?? null;

  const stats = await prisma.$queryRaw<StatRow[]>`
    SELECT
      COUNT(mp.id) AS "totalGames",
      COUNT(DISTINCT ms.id) AS "participationCount",
      COALESCE(SUM(CASE WHEN mp.team = mg."winnerTeam" THEN 1 ELSE 0 END), 0) AS wins,
      COALESCE(SUM(CASE WHEN mp.team != mg."winnerTeam" THEN 1 ELSE 0 END), 0) AS losses,
      COALESCE(SUM(mp.kills), 0) AS kills,
      COALESCE(SUM(mp.deaths), 0) AS deaths,
      COALESCE(SUM(mp.assists), 0) AS assists,
      0 AS "mvpCount"
    FROM "MatchParticipant" mp
    JOIN "MatchGame" mg ON mg.id = mp."gameId"
    JOIN "MatchSeries" ms ON ms.id = mg."seriesId"
    WHERE mp."playerId" = ${player.id}
      AND (${season?.id ?? null}::int IS NULL OR ms."seasonId" = ${season?.id ?? null})
  `;

  const stat = stats[0] ?? null;
  const totalGames = toNumber(stat?.totalGames);
  const wins = toNumber(stat?.wins);
  const losses = toNumber(stat?.losses);
  const kills = toNumber(stat?.kills);
  const deaths = toNumber(stat?.deaths);
  const assists = toNumber(stat?.assists);
  const participationCount = toNumber(stat?.participationCount);
  const mvpCount = toNumber(stat?.mvpCount);
  const winRate = totalGames > 0 ? (wins / totalGames) * 100 : 0;
  const kda = deaths > 0 ? (kills + assists) / deaths : kills + assists;

  const recentRows = await prisma.$queryRaw<RecentGameRow[]>`
    SELECT
      ms.title,
      mg."gameNumber",
      CASE
        WHEN mp.team = mg."winnerTeam" THEN 'WIN'
        WHEN mp.team != mg."winnerTeam" THEN 'LOSE'
        ELSE 'UNKNOWN'
      END AS result,
      mp.kills,
      mp.deaths,
      mp.assists,
      c.name AS "championName",
      ms."createdAt"
    FROM "MatchParticipant" mp
    JOIN "MatchGame" mg ON mg.id = mp."gameId"
    JOIN "MatchSeries" ms ON ms.id = mg."seriesId"
    LEFT JOIN "Champion" c ON c.id = mp."championId"
    WHERE mp."playerId" = ${player.id}
      AND (${season?.id ?? null}::int IS NULL OR ms."seasonId" = ${season?.id ?? null})
    ORDER BY ms."createdAt" DESC, mg."gameNumber" DESC
    LIMIT 3
  `;

  return {
    playerId: player.id,
    name: player.name,
    nickname: player.nickname,
    tag: player.tag,
    currentTier: player.currentTier,
    peakTier: player.peakTier,
    seasonName: season?.name ?? null,
    totalGames,
    participationCount,
    wins,
    losses,
    winRate,
    kills,
    deaths,
    assists,
    kda,
    mvpCount,
    recentGames: recentRows.map((row) => ({
      title: row.title,
      gameNumber: row.gameNumber,
      result: row.result ?? "UNKNOWN",
      kills: row.kills ?? 0,
      deaths: row.deaths ?? 0,
      assists: row.assists ?? 0,
      championName: row.championName,
    })),
    baseUrl: getBaseUrl(),
  };
}

export async function getRankingForKakao() {
  const seasons = await prisma.$queryRaw<SeasonRow[]>`
    SELECT id, name
    FROM "Season"
    WHERE "isActive" = true
    ORDER BY id DESC
    LIMIT 1
  `;
  const season = seasons[0] ?? null;

  const rows = await prisma.$queryRaw<RankingRow[]>`
    SELECT
      p.nickname,
      p.tag,
      COUNT(mp.id) AS "totalGames",
      COALESCE(SUM(CASE WHEN mp.team = mg."winnerTeam" THEN 1 ELSE 0 END), 0) AS wins,
      COALESCE(SUM(mp.kills), 0) AS kills,
      COALESCE(SUM(mp.deaths), 0) AS deaths,
      COALESCE(SUM(mp.assists), 0) AS assists
    FROM "Player" p
    JOIN "MatchParticipant" mp ON mp."playerId" = p.id
    JOIN "MatchGame" mg ON mg.id = mp."gameId"
    JOIN "MatchSeries" ms ON ms.id = mg."seriesId"
    WHERE (${season?.id ?? null}::int IS NULL OR ms."seasonId" = ${season?.id ?? null})
    GROUP BY p.id, p.nickname, p.tag
    HAVING COUNT(mp.id) > 0
    ORDER BY (COALESCE(SUM(CASE WHEN mp.team = mg."winnerTeam" THEN 1 ELSE 0 END), 0)::float / COUNT(mp.id)) DESC,
             COUNT(mp.id) DESC
    LIMIT 5
  `;

  return rows.map((row) => {
    const totalGames = toNumber(row.totalGames);
    const wins = toNumber(row.wins);
    const kills = toNumber(row.kills);
    const deaths = toNumber(row.deaths);
    const assists = toNumber(row.assists);

    return {
      nickname: row.nickname,
      tag: row.tag,
      totalGames,
      winRate: totalGames > 0 ? (wins / totalGames) * 100 : 0,
      kda: deaths > 0 ? (kills + assists) / deaths : kills + assists,
    };
  });
}
