export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";
import { getGameMvpParticipant } from "@/lib/mvp";
import { getCurrentSeasonId } from "@/lib/stats/recalculate";

const MAX_CONSISTENCY_PARTICIPANTS = Number(process.env.ADMIN_STATS_CONSISTENCY_PARTICIPANT_LIMIT ?? "20000");
const MAX_CONSISTENCY_STORED_STATS = Number(process.env.ADMIN_STATS_CONSISTENCY_STORED_STAT_LIMIT ?? "5000");

type RawPlayerStat = {
  playerId: number;
  name: string;
  nickname: string;
  tag: string;
  totalGames: number;
  participationCount: number;
  wins: number;
  losses: number;
  mvpCount: number;
};

type StoredPlayerStat = RawPlayerStat;

type StatDiff = {
  playerId: number;
  name: string;
  nickname: string;
  tag: string;
  stored: Omit<StoredPlayerStat, "playerId" | "name" | "nickname" | "tag"> | null;
  raw: Omit<RawPlayerStat, "playerId" | "name" | "nickname" | "tag"> | null;
  issues: string[];
};

function emptyRawStat(base: Pick<RawPlayerStat, "playerId" | "name" | "nickname" | "tag">): RawPlayerStat {
  return {
    ...base,
    totalGames: 0,
    participationCount: 0,
    wins: 0,
    losses: 0,
    mvpCount: 0,
  };
}

function stripIdentity(stat: RawPlayerStat | StoredPlayerStat) {
  return {
    totalGames: stat.totalGames,
    participationCount: stat.participationCount,
    wins: stat.wins,
    losses: stat.losses,
    mvpCount: stat.mvpCount,
  };
}

export async function GET(req: NextRequest) {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  try {
    const seasonIdParam = Number(req.nextUrl.searchParams.get("seasonId") ?? 0);
    const seasonId = Number.isInteger(seasonIdParam) && seasonIdParam > 0
      ? seasonIdParam
      : await getCurrentSeasonId();

    if (!seasonId) {
      return NextResponse.json({ message: "활성 시즌이 없습니다." }, { status: 400 });
    }

    const [season, participants, storedStats] = await Promise.all([
      prisma.season.findUnique({
        where: { id: seasonId },
        select: { id: true, name: true, isActive: true },
      }),
      prisma.matchParticipant.findMany({
        where: { game: { series: { seasonId } } },
        orderBy: { id: "asc" },
        take: Number.isFinite(MAX_CONSISTENCY_PARTICIPANTS) && MAX_CONSISTENCY_PARTICIPANTS > 0 ? MAX_CONSISTENCY_PARTICIPANTS : 20000,
        include: {
          player: { select: { id: true, name: true, nickname: true, tag: true } },
          game: {
            select: {
              id: true,
              seriesId: true,
              winnerTeam: true,
              mvpPlayerId: true,
            },
          },
        },
      }),
      prisma.playerSeasonStat.findMany({
        where: { seasonId },
        orderBy: { id: "asc" },
        take: Number.isFinite(MAX_CONSISTENCY_STORED_STATS) && MAX_CONSISTENCY_STORED_STATS > 0 ? MAX_CONSISTENCY_STORED_STATS : 5000,
        include: {
          player: { select: { id: true, name: true, nickname: true, tag: true } },
        },
      }),
    ]);

    if (!season) {
      return NextResponse.json({ message: "시즌을 찾을 수 없습니다." }, { status: 404 });
    }

    const participantsByGame = new Map<number, typeof participants>();
    for (const participant of participants) {
      const items = participantsByGame.get(participant.game.id) ?? [];
      items.push(participant);
      participantsByGame.set(participant.game.id, items);
    }

    const mvpPlayerIdByGame = new Map<number, number>();
    for (const [gameId, gameParticipants] of participantsByGame.entries()) {
      const storedMvpPlayerId = gameParticipants[0]?.game.mvpPlayerId ?? null;

      if (storedMvpPlayerId) {
        mvpPlayerIdByGame.set(gameId, storedMvpPlayerId);
        continue;
      }

      const calculatedMvp = getGameMvpParticipant(
        gameParticipants.map((participant) => ({
          playerId: participant.playerId,
          kills: participant.kills,
          deaths: participant.deaths,
          assists: participant.assists,
          team: participant.team,
        })),
        gameParticipants[0]?.game.winnerTeam ?? "",
      );

      if (calculatedMvp) {
        mvpPlayerIdByGame.set(gameId, calculatedMvp.playerId);
      }
    }

    const rawMap = new Map<number, RawPlayerStat & { seriesIds: Set<number> }>();

    for (const participant of participants) {
      const existing = rawMap.get(participant.playerId) ?? {
        ...emptyRawStat({
          playerId: participant.playerId,
          name: participant.player.name,
          nickname: participant.player.nickname,
          tag: participant.player.tag,
        }),
        seriesIds: new Set<number>(),
      };

      const isWin = participant.team === participant.game.winnerTeam;
      const isMvp = mvpPlayerIdByGame.get(participant.game.id) === participant.playerId;

      existing.totalGames += 1;
      existing.seriesIds.add(participant.game.seriesId);
      existing.wins += isWin ? 1 : 0;
      existing.losses += isWin ? 0 : 1;
      existing.mvpCount += isMvp ? 1 : 0;
      existing.participationCount = existing.seriesIds.size;

      rawMap.set(participant.playerId, existing);
    }

    const storedMap = new Map<number, StoredPlayerStat>();
    for (const stat of storedStats) {
      storedMap.set(stat.playerId, {
        playerId: stat.playerId,
        name: stat.player.name,
        nickname: stat.player.nickname,
        tag: stat.player.tag,
        totalGames: stat.totalGames,
        participationCount: stat.participationCount,
        wins: stat.wins,
        losses: stat.losses,
        mvpCount: stat.mvpCount,
      });
    }

    const playerIds = new Set<number>([...rawMap.keys(), ...storedMap.keys()]);
    const diffs: StatDiff[] = [];

    for (const playerId of playerIds) {
      const raw = rawMap.get(playerId) ?? null;
      const stored = storedMap.get(playerId) ?? null;
      const base = raw ?? stored;

      if (!base) continue;

      const issues: string[] = [];
      if (!raw) issues.push("참가 원본 없음");
      if (!stored) issues.push("시즌 통계 없음");

      if (raw && stored) {
        if (raw.totalGames !== stored.totalGames) issues.push(`세트 수 ${stored.totalGames} → ${raw.totalGames}`);
        if (raw.participationCount !== stored.participationCount) issues.push(`참여 ${stored.participationCount} → ${raw.participationCount}`);
        if (raw.wins !== stored.wins) issues.push(`승 ${stored.wins} → ${raw.wins}`);
        if (raw.losses !== stored.losses) issues.push(`패 ${stored.losses} → ${raw.losses}`);
        if (raw.mvpCount !== stored.mvpCount) issues.push(`MVP ${stored.mvpCount} → ${raw.mvpCount}`);
      }

      if (issues.length > 0) {
        diffs.push({
          playerId,
          name: base.name,
          nickname: base.nickname,
          tag: base.tag,
          stored: stored ? stripIdentity(stored) : null,
          raw: raw ? stripIdentity(raw) : null,
          issues,
        });
      }
    }

    diffs.sort((a, b) => a.name.localeCompare(b.name));

    const eligibleRawPlayers = [...rawMap.values()]
      .filter((player) => player.participationCount >= 10)
      .map((player) => ({
        playerId: player.playerId,
        name: player.name,
        nickname: player.nickname,
        tag: player.tag,
        totalGames: player.totalGames,
        participationCount: player.participationCount,
        wins: player.wins,
        losses: player.losses,
        mvpCount: player.mvpCount,
      }));

    return NextResponse.json({
      season,
      ok: diffs.length === 0,
      message: diffs.length === 0
        ? "저장 통계와 원본 참가 데이터가 일치합니다."
        : "저장 통계와 원본 참가 데이터가 다른 플레이어가 있습니다. 관리자 통계 재계산을 실행하세요.",
      diffCount: diffs.length,
      diffs,
      limits: {
        participantLimit: Number.isFinite(MAX_CONSISTENCY_PARTICIPANTS) && MAX_CONSISTENCY_PARTICIPANTS > 0 ? MAX_CONSISTENCY_PARTICIPANTS : 20000,
        storedStatLimit: Number.isFinite(MAX_CONSISTENCY_STORED_STATS) && MAX_CONSISTENCY_STORED_STATS > 0 ? MAX_CONSISTENCY_STORED_STATS : 5000,
        participantLimitReached: participants.length >= (Number.isFinite(MAX_CONSISTENCY_PARTICIPANTS) && MAX_CONSISTENCY_PARTICIPANTS > 0 ? MAX_CONSISTENCY_PARTICIPANTS : 20000),
        storedStatLimitReached: storedStats.length >= (Number.isFinite(MAX_CONSISTENCY_STORED_STATS) && MAX_CONSISTENCY_STORED_STATS > 0 ? MAX_CONSISTENCY_STORED_STATS : 5000),
      },
      rawTop3: {
        winRate: [...eligibleRawPlayers]
          .sort((a, b) => (b.wins / Math.max(1, b.totalGames)) - (a.wins / Math.max(1, a.totalGames)) || b.participationCount - a.participationCount || b.mvpCount - a.mvpCount)
          .slice(0, 3),
        participation: [...eligibleRawPlayers]
          .sort((a, b) => b.participationCount - a.participationCount || (b.wins / Math.max(1, b.totalGames)) - (a.wins / Math.max(1, a.totalGames)) || b.mvpCount - a.mvpCount)
          .slice(0, 3),
        mvp: [...eligibleRawPlayers]
          .filter((player) => player.mvpCount > 0)
          .sort((a, b) => b.mvpCount - a.mvpCount || (b.wins / Math.max(1, b.totalGames)) - (a.wins / Math.max(1, a.totalGames)) || b.participationCount - a.participationCount)
          .slice(0, 3),
      },
    });
  } catch (error) {
    console.error("[ADMIN_STATS_CONSISTENCY_ERROR]", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "통계 일관성 검사 실패" },
      { status: 500 },
    );
  }
}
