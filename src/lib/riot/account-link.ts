import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { getRiotFeatureStatus } from "@/lib/riot/feature";
import { recordRiotAccountLinkLog } from "@/lib/riot/audit";
import { getRiotAccountByRiotId, getSummonerByPuuid } from "@/lib/riot/client";

export type RiotAccountActorType = "USER" | "ADMIN" | "SYSTEM";

export type RiotAccountStatusPayload = {
  feature: ReturnType<typeof getRiotFeatureStatus>;
  player: {
    id: number;
    name: string;
    nickname: string;
    tag: string;
    currentTier: string | null;
    peakTier: string | null;
  } | null;
  account: {
    id: number;
    playerId: number;
    gameName: string;
    tagLine: string;
    puuidMasked: string;
    summonerId: string | null;
    accountId: string | null;
    profileIconId: number | null;
    summonerLevel: number | null;
    isVerified: boolean;
    linkedByUserAccountId: number | null;
    linkedAt: string | null;
    unlinkedAt: string | null;
    syncStatus: string;
    lastErrorMessage: string | null;
    lastErrorAt: string | null;
    lastSyncedAt: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  soloRank: {
    queueType: string;
    tier: string | null;
    rank: string | null;
    leaguePoints: number;
    wins: number;
    losses: number;
    winRate: number;
    updatedAt: string;
  } | null;
};

type PlayerWithRiotStatus = {
  id: number;
  name: string;
  nickname: string;
  tag: string;
  currentTier: string | null;
  peakTier: string | null;
  riotAccount: {
    id: number;
    playerId: number;
    gameName: string;
    tagLine: string;
    puuid: string;
    summonerId: string | null;
    accountId: string | null;
    profileIconId: number | null;
    summonerLevel: number | null;
    isVerified: boolean;
    linkedByUserAccountId: number | null;
    linkedAt: Date | null;
    unlinkedAt: Date | null;
    syncStatus: string;
    lastErrorMessage: string | null;
    lastErrorAt: Date | null;
    lastSyncedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  } | null;
  soloRankSnapshot: {
    queueType: string;
    tier: string | null;
    rank: string | null;
    leaguePoints: number;
    wins: number;
    losses: number;
    winRate: number;
    updatedAt: Date;
  } | null;
};

type RiotIdInput = {
  riotId?: unknown;
  gameName?: unknown;
  tagLine?: unknown;
};

type RequestMeta = {
  ipAddress?: string;
  userAgent?: string;
};

type LinkInput = {
  playerId: number;
  body: RiotIdInput;
  actorType: RiotAccountActorType;
  actorUserAccountId?: number | null;
  requestMeta?: RequestMeta;
};

type UnlinkInput = {
  playerId: number;
  actorType: RiotAccountActorType;
  actorUserAccountId?: number | null;
  requestMeta?: RequestMeta;
};

function cleanText(value: unknown) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
}

function toIso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function mask(value: string | null | undefined) {
  const text = cleanText(value ?? "");
  if (!text) return "-";
  if (text.length <= 12) return "****";
  return `${text.slice(0, 6)}…${text.slice(-6)}`;
}

function parseRiotId(input: RiotIdInput) {
  const riotId = cleanText(input.riotId);
  let gameName = cleanText(input.gameName);
  let tagLine = cleanText(input.tagLine).replace(/^#/, "");

  if ((!gameName || !tagLine) && riotId) {
    const sharpIndex = riotId.lastIndexOf("#");
    if (sharpIndex > 0) {
      gameName = riotId.slice(0, sharpIndex).trim();
      tagLine = riotId.slice(sharpIndex + 1).trim().replace(/^#/, "");
    }
  }

  if (!gameName || !tagLine) {
    return {
      ok: false as const,
      message: "Riot ID를 gameName과 tagLine으로 입력하거나 닉네임#태그 형식으로 입력해주세요.",
    };
  }

  if (gameName.length > 64 || tagLine.length > 16) {
    return {
      ok: false as const,
      message: "Riot ID 길이가 너무 깁니다. 닉네임과 태그를 다시 확인해주세요.",
    };
  }

  return {
    ok: true as const,
    gameName,
    tagLine,
  };
}

export function getRiotRequestMeta(request: NextRequest): RequestMeta {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  return {
    ipAddress: forwardedFor || realIp || undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  };
}

export function getRiotAccountDisabledResponse() {
  return {
    message: getRiotFeatureStatus().message,
    code: "RIOT_FEATURE_DISABLED",
    enabled: false,
  };
}

async function findPlayerWithRiotStatus(playerId: number): Promise<PlayerWithRiotStatus | null> {
  return prisma.player.findUnique({
    where: { id: playerId },
    select: {
      id: true,
      name: true,
      nickname: true,
      tag: true,
      currentTier: true,
      peakTier: true,
      riotAccount: {
        select: {
          id: true,
          playerId: true,
          gameName: true,
          tagLine: true,
          puuid: true,
          summonerId: true,
          accountId: true,
          profileIconId: true,
          summonerLevel: true,
          isVerified: true,
          linkedByUserAccountId: true,
          linkedAt: true,
          unlinkedAt: true,
          syncStatus: true,
          lastErrorMessage: true,
          lastErrorAt: true,
          lastSyncedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      soloRankSnapshot: {
        select: {
          queueType: true,
          tier: true,
          rank: true,
          leaguePoints: true,
          wins: true,
          losses: true,
          winRate: true,
          updatedAt: true,
        },
      },
    },
  });
}

export async function getPlayerRiotAccountStatus(playerId: number): Promise<RiotAccountStatusPayload | null> {
  const player = await findPlayerWithRiotStatus(playerId);
  if (!player) return null;

  return {
    feature: getRiotFeatureStatus(),
    player: {
      id: player.id,
      name: player.name,
      nickname: player.nickname,
      tag: player.tag,
      currentTier: player.currentTier,
      peakTier: player.peakTier,
    },
    account: player.riotAccount
      ? {
          id: player.riotAccount.id,
          playerId: player.riotAccount.playerId,
          gameName: player.riotAccount.gameName,
          tagLine: player.riotAccount.tagLine,
          puuidMasked: mask(player.riotAccount.puuid),
          summonerId: player.riotAccount.summonerId,
          accountId: player.riotAccount.accountId,
          profileIconId: player.riotAccount.profileIconId,
          summonerLevel: player.riotAccount.summonerLevel,
          isVerified: player.riotAccount.isVerified,
          linkedByUserAccountId: player.riotAccount.linkedByUserAccountId,
          linkedAt: toIso(player.riotAccount.linkedAt),
          unlinkedAt: toIso(player.riotAccount.unlinkedAt),
          syncStatus: player.riotAccount.syncStatus,
          lastErrorMessage: player.riotAccount.lastErrorMessage,
          lastErrorAt: toIso(player.riotAccount.lastErrorAt),
          lastSyncedAt: toIso(player.riotAccount.lastSyncedAt),
          createdAt: player.riotAccount.createdAt.toISOString(),
          updatedAt: player.riotAccount.updatedAt.toISOString(),
        }
      : null,
    soloRank: player.soloRankSnapshot
      ? {
          queueType: player.soloRankSnapshot.queueType,
          tier: player.soloRankSnapshot.tier,
          rank: player.soloRankSnapshot.rank,
          leaguePoints: player.soloRankSnapshot.leaguePoints,
          wins: player.soloRankSnapshot.wins,
          losses: player.soloRankSnapshot.losses,
          winRate: player.soloRankSnapshot.winRate,
          updatedAt: player.soloRankSnapshot.updatedAt.toISOString(),
        }
      : null,
  };
}

export async function linkPlayerRiotAccount(input: LinkInput) {
  const parsed = parseRiotId(input.body);
  if (!parsed.ok) {
    return { ok: false as const, status: 400, message: parsed.message };
  }

  const player = await prisma.player.findUnique({
    where: { id: input.playerId },
    select: { id: true, name: true, nickname: true, tag: true },
  });

  if (!player) {
    return { ok: false as const, status: 404, message: "플레이어를 찾을 수 없습니다." };
  }

  const now = new Date();
  const account = await getRiotAccountByRiotId(parsed.gameName, parsed.tagLine);
  const summoner = await getSummonerByPuuid(account.puuid);

  const duplicate = await prisma.playerRiotAccount.findFirst({
    where: {
      puuid: account.puuid,
      NOT: { playerId: input.playerId },
    },
    select: {
      playerId: true,
      player: { select: { name: true, nickname: true, tag: true } },
    },
  });

  if (duplicate) {
    await recordRiotAccountLinkLog({
      playerId: input.playerId,
      userAccountId: input.actorUserAccountId,
      action: `${input.actorType}_LINK_BLOCKED_DUPLICATE`,
      actorType: input.actorType,
      gameName: account.gameName,
      tagLine: account.tagLine,
      puuid: account.puuid,
      ipAddress: input.requestMeta?.ipAddress,
      userAgent: input.requestMeta?.userAgent,
      message: `이미 다른 플레이어 #${duplicate.playerId}에 연결된 Riot 계정입니다.`,
    });

    return {
      ok: false as const,
      status: 409,
      message: `이미 다른 플레이어(${duplicate.player.name} / ${duplicate.player.nickname}#${duplicate.player.tag})에 연결된 Riot 계정입니다.`,
    };
  }

  const linked = await prisma.playerRiotAccount.upsert({
    where: { playerId: player.id },
    update: {
      gameName: account.gameName,
      tagLine: account.tagLine,
      puuid: account.puuid,
      summonerId: summoner.id ?? summoner.summonerId ?? summoner.encryptedSummonerId ?? null,
      accountId: summoner.accountId ?? null,
      profileIconId: summoner.profileIconId ?? null,
      summonerLevel: summoner.summonerLevel ?? null,
      isVerified: true,
      linkedByUserAccountId: input.actorUserAccountId ?? null,
      linkedAt: now,
      unlinkedAt: null,
      syncStatus: "IDLE",
      lastErrorMessage: null,
      lastErrorAt: null,
    },
    create: {
      playerId: player.id,
      gameName: account.gameName,
      tagLine: account.tagLine,
      puuid: account.puuid,
      summonerId: summoner.id ?? summoner.summonerId ?? summoner.encryptedSummonerId ?? null,
      accountId: summoner.accountId ?? null,
      profileIconId: summoner.profileIconId ?? null,
      summonerLevel: summoner.summonerLevel ?? null,
      isVerified: true,
      linkedByUserAccountId: input.actorUserAccountId ?? null,
      linkedAt: now,
      syncStatus: "IDLE",
    },
  });

  await recordRiotAccountLinkLog({
    playerId: player.id,
    userAccountId: input.actorUserAccountId,
    action: `${input.actorType}_LINK`,
    actorType: input.actorType,
    gameName: linked.gameName,
    tagLine: linked.tagLine,
    puuid: linked.puuid,
    ipAddress: input.requestMeta?.ipAddress,
    userAgent: input.requestMeta?.userAgent,
    message: `${player.name}(${player.nickname}#${player.tag}) Riot 계정 연결`,
  });

  return {
    ok: true as const,
    status: 200,
    message: "Riot 계정 연결이 완료되었습니다.",
    data: await getPlayerRiotAccountStatus(player.id),
  };
}

export async function unlinkPlayerRiotAccount(input: UnlinkInput) {
  const player = await prisma.player.findUnique({
    where: { id: input.playerId },
    select: {
      id: true,
      name: true,
      nickname: true,
      tag: true,
      riotAccount: { select: { gameName: true, tagLine: true, puuid: true } },
    },
  });

  if (!player) {
    return { ok: false as const, status: 404, message: "플레이어를 찾을 수 없습니다." };
  }

  if (!player.riotAccount) {
    return {
      ok: true as const,
      status: 200,
      message: "이미 연결된 Riot 계정이 없습니다.",
      data: await getPlayerRiotAccountStatus(player.id),
    };
  }

  const previous = player.riotAccount;

  await prisma.$transaction([
    prisma.playerSoloMatch.deleteMany({ where: { playerId: player.id } }),
    prisma.playerSoloRankSnapshot.deleteMany({ where: { playerId: player.id } }),
    prisma.playerRiotAccount.delete({ where: { playerId: player.id } }),
  ]);

  await recordRiotAccountLinkLog({
    playerId: player.id,
    userAccountId: input.actorUserAccountId,
    action: `${input.actorType}_UNLINK`,
    actorType: input.actorType,
    gameName: previous.gameName,
    tagLine: previous.tagLine,
    puuid: previous.puuid,
    ipAddress: input.requestMeta?.ipAddress,
    userAgent: input.requestMeta?.userAgent,
    message: `${player.name}(${player.nickname}#${player.tag}) Riot 계정 연동 해제 및 캐시 삭제`,
  });

  return {
    ok: true as const,
    status: 200,
    message: "Riot 계정 연동을 해제했고 저장된 솔랭 캐시를 삭제했습니다.",
    data: await getPlayerRiotAccountStatus(player.id),
  };
}
