export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { requireApprovedUserOrAdmin } from "@/lib/auth/access";
import { rejectIfRateLimited } from "@/lib/rate-limit";
import { getRiotStatusFromError, recordRiotApiStatus } from "@/lib/riot/status";
import { logServerError } from "@/lib/server/safe-log";
import {
  calculateWinRate,
  findParticipantByPuuid,
  getMatchById,
  getRecentRankedMatchIdsByPuuid,
  getRiotAccountByRiotId,
  getSoloRankEntryByPuuid,
  getSummonerByPuuid,
  isSoloRankMatch,
} from "@/lib/riot/client";

type RouteContext = { params: Promise<Record<string, string | string[] | undefined>> };

const RECENT_SOLO_MATCH_COUNT = 10;
const SYNC_COOLDOWN_MINUTES = 10;
const MAX_DRAFT_PLAYERS = 10;

function isCooldownActive(lastSyncedAt: Date | null | undefined) {
  if (!lastSyncedAt) return false;
  const diffMinutes = (Date.now() - new Date(lastSyncedAt).getTime()) / 1000 / 60;
  return diffMinutes < SYNC_COOLDOWN_MINUTES;
}

function getPrimaryRuneId(participant: NonNullable<ReturnType<typeof findParticipantByPuuid>>) {
  return participant.perks?.styles?.[0]?.selections?.[0]?.perk ?? null;
}

function getSubRuneId(participant: NonNullable<ReturnType<typeof findParticipantByPuuid>>) {
  return participant.perks?.styles?.[1]?.style ?? null;
}

async function syncPlayerSoloRank(player: {
  id: number;
  name: string;
  nickname: string;
  tag: string;
  riotAccount: { lastSyncedAt: Date | null } | null;
}) {
  if (!player.nickname || !player.tag) {
    return { status: "failed" as const, message: "Riot ID 없음" };
  }

  if (isCooldownActive(player.riotAccount?.lastSyncedAt)) {
    return { status: "skipped" as const, message: "10분 쿨다운" };
  }

  const account = await getRiotAccountByRiotId(player.nickname, player.tag);
  const summoner = await getSummonerByPuuid(account.puuid);
  const soloRankEntry = await getSoloRankEntryByPuuid(account.puuid);
  const matchIds = await getRecentRankedMatchIdsByPuuid(account.puuid, RECENT_SOLO_MATCH_COUNT);

  let savedMatchCount = 0;
  let skippedMatchCount = 0;

  for (const matchId of matchIds) {
    const match = await getMatchById(matchId);

    if (!isSoloRankMatch(match)) {
      skippedMatchCount += 1;
      continue;
    }

    const participant = findParticipantByPuuid(match, account.puuid);

    if (!participant) {
      skippedMatchCount += 1;
      continue;
    }

    await prisma.playerSoloMatch.upsert({
      where: { playerId_matchId: { playerId: player.id, matchId } },
      update: {
        queueId: match.info.queueId,
        championId: participant.championId,
        championName: participant.championName,
        position: participant.teamPosition || null,
        role: participant.role || null,
        kills: participant.kills,
        deaths: participant.deaths,
        assists: participant.assists,
        win: participant.win,
        gameDuration: match.info.gameDuration,
        gameCreation: new Date(match.info.gameCreation),
        summonerSpell1: participant.summoner1Id,
        summonerSpell2: participant.summoner2Id,
        primaryRuneId: getPrimaryRuneId(participant),
        subRuneId: getSubRuneId(participant),
        item0: participant.item0,
        item1: participant.item1,
        item2: participant.item2,
        item3: participant.item3,
        item4: participant.item4,
        item5: participant.item5,
        item6: participant.item6,
        totalDamageDealtToChampions: participant.totalDamageDealtToChampions,
        totalDamageTaken: participant.totalDamageTaken,
        visionScore: participant.visionScore,
      },
      create: {
        playerId: player.id,
        matchId,
        queueId: match.info.queueId,
        championId: participant.championId,
        championName: participant.championName,
        position: participant.teamPosition || null,
        role: participant.role || null,
        kills: participant.kills,
        deaths: participant.deaths,
        assists: participant.assists,
        win: participant.win,
        gameDuration: match.info.gameDuration,
        gameCreation: new Date(match.info.gameCreation),
        summonerSpell1: participant.summoner1Id,
        summonerSpell2: participant.summoner2Id,
        primaryRuneId: getPrimaryRuneId(participant),
        subRuneId: getSubRuneId(participant),
        item0: participant.item0,
        item1: participant.item1,
        item2: participant.item2,
        item3: participant.item3,
        item4: participant.item4,
        item5: participant.item5,
        item6: participant.item6,
        totalDamageDealtToChampions: participant.totalDamageDealtToChampions,
        totalDamageTaken: participant.totalDamageTaken,
        visionScore: participant.visionScore,
      },
    });

    savedMatchCount += 1;
  }

  await prisma.playerRiotAccount.upsert({
    where: { playerId: player.id },
    update: {
      gameName: account.gameName,
      tagLine: account.tagLine,
      puuid: account.puuid,
      summonerId: null,
      accountId: summoner.accountId,
      profileIconId: summoner.profileIconId,
      summonerLevel: summoner.summonerLevel,
      lastSyncedAt: new Date(),
    },
    create: {
      playerId: player.id,
      gameName: account.gameName,
      tagLine: account.tagLine,
      puuid: account.puuid,
      summonerId: null,
      accountId: summoner.accountId,
      profileIconId: summoner.profileIconId,
      summonerLevel: summoner.summonerLevel,
      lastSyncedAt: new Date(),
    },
  });

  if (soloRankEntry) {
    await prisma.playerSoloRankSnapshot.upsert({
      where: { playerId: player.id },
      update: {
        queueType: soloRankEntry.queueType,
        tier: soloRankEntry.tier,
        rank: soloRankEntry.rank,
        leaguePoints: soloRankEntry.leaguePoints,
        wins: soloRankEntry.wins,
        losses: soloRankEntry.losses,
        winRate: calculateWinRate(soloRankEntry.wins, soloRankEntry.losses),
      },
      create: {
        playerId: player.id,
        queueType: soloRankEntry.queueType,
        tier: soloRankEntry.tier,
        rank: soloRankEntry.rank,
        leaguePoints: soloRankEntry.leaguePoints,
        wins: soloRankEntry.wins,
        losses: soloRankEntry.losses,
        winRate: calculateWinRate(soloRankEntry.wins, soloRankEntry.losses),
      },
    });
  }

  return { status: "updated" as const, message: "갱신 완료", savedMatchCount, skippedMatchCount };
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    await requireApprovedUserOrAdmin();

    const rateLimitRejected = await rejectIfRateLimited(req, {
      action: "DRAFT_SOLO_RANK_SYNC",
      limit: 4,
      windowSeconds: 600,
    });
    if (rateLimitRejected) return rateLimitRejected;

    const params = await context.params;
    const rawDraftId = params.draftId ?? params.draftid;
    const draftId = Array.isArray(rawDraftId) ? rawDraftId[0] : rawDraftId;
    const parsedDraftId = Number(draftId);

    if (!Number.isInteger(parsedDraftId) || parsedDraftId <= 0) {
      return NextResponse.json({ message: "유효하지 않은 밸런스 ID입니다." }, { status: 400 });
    }

    const draft = await prisma.teamBalanceDraft.findUnique({
      where: { id: parsedDraftId },
      select: {
        id: true,
        players: {
          orderBy: [{ team: "asc" }, { position: "asc" }],
          take: MAX_DRAFT_PLAYERS,
          select: {
            player: {
              select: {
                id: true,
                name: true,
                nickname: true,
                tag: true,
                riotAccount: { select: { lastSyncedAt: true } },
              },
            },
          },
        },
      },
    });

    if (!draft) {
      return NextResponse.json({ message: "저장 밸런스를 찾을 수 없습니다." }, { status: 404 });
    }

    const results: Array<{ playerId: number; name: string; status: string; message: string }> = [];

    for (const draftPlayer of draft.players) {
      const player = draftPlayer.player;

      try {
        const result = await syncPlayerSoloRank(player);
        results.push({ playerId: player.id, name: player.name, status: result.status, message: result.message });
      } catch (error) {
        results.push({
          playerId: player.id,
          name: player.name,
          status: "failed",
          message: error instanceof Error ? error.message : "알 수 없는 오류",
        });
      }
    }

    const updated = results.filter((item) => item.status === "updated").length;
    const skipped = results.filter((item) => item.status === "skipped").length;
    const failed = results.filter((item) => item.status === "failed").length;

    await recordRiotApiStatus({ scope: "DRAFT_SOLO_RANK_SYNC", ok: failed === 0 });

    return NextResponse.json({
      message: "저장 밸런스 참가자 솔랭 전적 갱신이 완료되었습니다.",
      processed: results.length,
      updated,
      skipped,
      failed,
      results,
    });
  } catch (error) {
    await recordRiotApiStatus(getRiotStatusFromError("DRAFT_SOLO_RANK_SYNC", error));
    logServerError("[DRAFT_SOLO_RANK_SYNC_POST_ERROR]", error);

    if (error instanceof Error) {
      if (error.message === "UNAUTHORIZED") return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
      if (error.message === "NOT_APPROVED") return NextResponse.json({ message: "승인된 유저만 사용할 수 있습니다." }, { status: 403 });
      return NextResponse.json({ message: "저장 밸런스 솔랭 전적 갱신 중 오류가 발생했습니다.", error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: "저장 밸런스 솔랭 전적 갱신 중 알 수 없는 오류가 발생했습니다." }, { status: 500 });
  }
}

