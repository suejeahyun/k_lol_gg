import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma/client";
import { getPublicBaseUrl } from "@/lib/http/base-url";
import { recordRiotAccountLinkLog, recordRiotApiRequestLog } from "@/lib/riot/audit";
import { getRiotRegionalRoute, isRiotFeatureEnabled } from "@/lib/riot/feature";
import { getSummonerByPuuid } from "@/lib/riot/client";

const TRUE_VALUES = new Set(["1", "true", "yes", "on", "enabled"]);
const RSO_AUTHORIZE_URL = "https://auth.riotgames.com/authorize";
const RSO_TOKEN_URL = "https://auth.riotgames.com/token";

type RiotRsoAccountMeDto = {
  puuid: string;
  gameName?: string;
  tagLine?: string;
};

type RiotRsoTokenResponse = {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  id_token?: string;
  refresh_token?: string;
};

export type RiotRsoStatus = {
  enabled: boolean;
  message: string;
  missing: string[];
};

function isTrue(value: string | undefined) {
  return TRUE_VALUES.has((value ?? "").trim().toLowerCase());
}

function cleanText(value: unknown) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
}

function getRsoStateTtlMinutes() {
  const parsed = Number(process.env.RIOT_RSO_STATE_TTL_MINUTES ?? 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 10;
  return Math.min(Math.floor(parsed), 60);
}

function getRsoRedirectUri() {
  return cleanText(process.env.RIOT_RSO_REDIRECT_URI) || `${getPublicBaseUrl()}/api/riot/rso/callback`;
}

function safeReturnTo(value: string | null | undefined) {
  const text = cleanText(value ?? "");
  if (!text || !text.startsWith("/") || text.startsWith("//")) return "/me/riot";
  if (text.startsWith("/api/")) return "/me/riot";
  return text;
}

function buildRedirectPath(returnTo: string | null | undefined, params: Record<string, string>) {
  const target = safeReturnTo(returnTo);
  const separator = target.includes("?") ? "&" : "?";
  return `${target}${separator}${new URLSearchParams(params).toString()}`;
}

export function getRiotRsoStatus(): RiotRsoStatus {
  const missing: string[] = [];

  if (!cleanText(process.env.RIOT_RSO_CLIENT_ID)) missing.push("RIOT_RSO_CLIENT_ID");
  if (!cleanText(process.env.RIOT_RSO_CLIENT_SECRET)) missing.push("RIOT_RSO_CLIENT_SECRET");

  if (!isRiotFeatureEnabled()) {
    return {
      enabled: false,
      missing,
      message: "Riot 기본 연동 기능이 비활성화되어 있어 RSO 본인 인증도 사용할 수 없습니다.",
    };
  }

  if (!isTrue(process.env.RIOT_RSO_ENABLED)) {
    return {
      enabled: false,
      missing,
      message: "Riot Sign On 본인 인증 기능이 비활성화되어 있습니다. RIOT_RSO_ENABLED=true 설정 후 사용할 수 있습니다.",
    };
  }

  if (missing.length > 0) {
    return {
      enabled: false,
      missing,
      message: `Riot Sign On 환경변수가 부족합니다: ${missing.join(", ")}`,
    };
  }

  return {
    enabled: true,
    missing: [],
    message: "Riot Sign On 본인 소유 인증을 사용할 수 있습니다.",
  };
}

export function assertRiotRsoEnabled() {
  const status = getRiotRsoStatus();
  if (!status.enabled) {
    throw new Error(status.message);
  }
}

export async function createRiotRsoAuthorizeUrl(input: {
  userAccountId: number;
  playerId: number;
  returnTo?: string | null;
}) {
  assertRiotRsoEnabled();

  const state = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + getRsoStateTtlMinutes() * 60 * 1000);
  const returnTo = safeReturnTo(input.returnTo);

  await prisma.riotRsoVerificationState.create({
    data: {
      userAccountId: input.userAccountId,
      playerId: input.playerId,
      state,
      returnTo,
      expiresAt,
    },
  });

  // 오래된 state는 best-effort로 정리한다.
  await prisma.riotRsoVerificationState.deleteMany({
    where: {
      expiresAt: { lt: now },
      consumedAt: { not: null },
    },
  }).catch(() => undefined);

  const params = new URLSearchParams({
    client_id: cleanText(process.env.RIOT_RSO_CLIENT_ID),
    redirect_uri: getRsoRedirectUri(),
    response_type: "code",
    scope: "openid offline_access",
    state,
  });

  return `${RSO_AUTHORIZE_URL}?${params.toString()}`;
}

async function consumeRsoState(state: string) {
  const now = new Date();
  const saved = await prisma.riotRsoVerificationState.findUnique({
    where: { state },
  });

  if (!saved) {
    return { ok: false as const, message: "Riot 본인 인증 state를 찾을 수 없습니다.", returnTo: "/me/riot" };
  }

  if (saved.consumedAt) {
    return { ok: false as const, message: "이미 사용된 Riot 본인 인증 요청입니다.", returnTo: saved.returnTo ?? "/me/riot" };
  }

  if (saved.expiresAt < now) {
    await prisma.riotRsoVerificationState.update({
      where: { id: saved.id },
      data: { consumedAt: now },
    }).catch(() => undefined);

    return { ok: false as const, message: "Riot 본인 인증 요청이 만료되었습니다. 다시 시도해주세요.", returnTo: saved.returnTo ?? "/me/riot" };
  }

  await prisma.riotRsoVerificationState.update({
    where: { id: saved.id },
    data: { consumedAt: now },
  });

  return { ok: true as const, state: saved };
}

async function exchangeRsoCode(code: string): Promise<RiotRsoTokenResponse> {
  assertRiotRsoEnabled();

  const startedAt = Date.now();
  const clientId = cleanText(process.env.RIOT_RSO_CLIENT_ID);
  const clientSecret = cleanText(process.env.RIOT_RSO_CLIENT_SECRET);
  const redirectUri = getRsoRedirectUri();

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });

  const response = await fetch(RSO_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });

  if (!response.ok) {
    const message = `Riot RSO 토큰 교환 실패: ${response.status}`;
    await recordRiotApiRequestLog({
      endpoint: "RSO_TOKEN",
      source: "RIOT_RSO",
      statusCode: response.status,
      durationMs: Date.now() - startedAt,
      errorCode: "RIOT_RSO_TOKEN_FAILED",
      message,
    });
    throw new Error(message);
  }

  const data = (await response.json()) as RiotRsoTokenResponse;

  await recordRiotApiRequestLog({
    endpoint: "RSO_TOKEN",
    source: "RIOT_RSO",
    statusCode: response.status,
    durationMs: Date.now() - startedAt,
  });

  if (!data.access_token) {
    throw new Error("Riot RSO access token을 받지 못했습니다.");
  }

  return data;
}

async function getRsoAccountMe(accessToken: string): Promise<RiotRsoAccountMeDto> {
  const startedAt = Date.now();
  const region = getRiotRegionalRoute();
  const url = `https://${region}.api.riotgames.com/riot/account/v1/accounts/me`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const message = `Riot RSO account/me 조회 실패: ${response.status}`;
    await recordRiotApiRequestLog({
      endpoint: "RSO_ACCOUNT_ME",
      source: "RIOT_RSO",
      statusCode: response.status,
      durationMs: Date.now() - startedAt,
      errorCode: "RIOT_RSO_ACCOUNT_ME_FAILED",
      message,
    });
    throw new Error(message);
  }

  const data = (await response.json()) as RiotRsoAccountMeDto;

  await recordRiotApiRequestLog({
    endpoint: "RSO_ACCOUNT_ME",
    source: "RIOT_RSO",
    statusCode: response.status,
    durationMs: Date.now() - startedAt,
  });

  if (!data.puuid) {
    throw new Error("Riot RSO account/me 응답에 PUUID가 없습니다.");
  }

  return data;
}

export async function completeRiotRsoVerification(input: {
  code: string;
  state: string;
  currentUserAccountId: number;
  currentPlayerId: number | null;
  ipAddress?: string;
  userAgent?: string;
}) {
  const consumed = await consumeRsoState(input.state);

  if (!consumed.ok) {
    return {
      ok: false as const,
      status: 400,
      redirectTo: buildRedirectPath(consumed.returnTo, { rso: "error", message: consumed.message }),
      message: consumed.message,
    };
  }

  const saved = consumed.state;
  const returnTo = saved.returnTo ?? "/me/riot";

  if (saved.userAccountId !== input.currentUserAccountId || saved.playerId !== input.currentPlayerId) {
    const message = "로그인 세션과 Riot 본인 인증 요청이 일치하지 않습니다. 다시 시도해주세요.";
    return {
      ok: false as const,
      status: 403,
      redirectTo: buildRedirectPath(returnTo, { rso: "error", message }),
      message,
    };
  }

  const token = await exchangeRsoCode(input.code);
  const account = await getRsoAccountMe(token.access_token);
  const now = new Date();

  const duplicate = await prisma.playerRiotAccount.findFirst({
    where: {
      puuid: account.puuid,
      NOT: { playerId: saved.playerId },
    },
    select: {
      playerId: true,
      player: { select: { name: true, nickname: true, tag: true } },
    },
  });

  if (duplicate) {
    const message = `해당 Riot 계정은 이미 다른 플레이어(${duplicate.player.name} / ${duplicate.player.nickname}#${duplicate.player.tag})에 연결되어 있습니다.`;
    await recordRiotAccountLinkLog({
      playerId: saved.playerId,
      userAccountId: input.currentUserAccountId,
      action: "USER_RSO_VERIFY_BLOCKED_DUPLICATE",
      actorType: "USER",
      gameName: account.gameName ?? undefined,
      tagLine: account.tagLine ?? undefined,
      puuid: account.puuid,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      message,
    });
    return {
      ok: false as const,
      status: 409,
      redirectTo: buildRedirectPath(returnTo, { rso: "error", message }),
      message,
    };
  }

  const existing = await prisma.playerRiotAccount.findUnique({
    where: { playerId: saved.playerId },
    select: { gameName: true, tagLine: true, puuid: true },
  });

  if (existing && existing.puuid !== account.puuid) {
    const message = `현재 연결된 Riot 계정(${existing.gameName}#${existing.tagLine})과 로그인한 Riot 계정이 다릅니다. 기존 연동을 해제한 뒤 다시 인증해주세요.`;
    await recordRiotAccountLinkLog({
      playerId: saved.playerId,
      userAccountId: input.currentUserAccountId,
      action: "USER_RSO_VERIFY_BLOCKED_MISMATCH",
      actorType: "USER",
      gameName: account.gameName ?? undefined,
      tagLine: account.tagLine ?? undefined,
      puuid: account.puuid,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      message,
    });
    return {
      ok: false as const,
      status: 409,
      redirectTo: buildRedirectPath(returnTo, { rso: "error", message }),
      message,
    };
  }

  const summoner = await getSummonerByPuuid(account.puuid);
  const gameName = cleanText(account.gameName) || existing?.gameName || "RSO Account";
  const tagLine = cleanText(account.tagLine) || existing?.tagLine || "RSO";

  await prisma.playerRiotAccount.upsert({
    where: { playerId: saved.playerId },
    update: {
      gameName,
      tagLine,
      puuid: account.puuid,
      summonerId: summoner.id ?? summoner.summonerId ?? summoner.encryptedSummonerId ?? null,
      accountId: summoner.accountId ?? null,
      profileIconId: summoner.profileIconId ?? null,
      summonerLevel: summoner.summonerLevel ?? null,
      isVerified: true,
      verificationMethod: "RSO",
      verifiedByUserAccountId: input.currentUserAccountId,
      verifiedAt: now,
      rsoSubject: account.puuid,
      linkedByUserAccountId: input.currentUserAccountId,
      linkedAt: now,
      unlinkedAt: null,
      syncStatus: "IDLE",
      lastErrorMessage: null,
      lastErrorAt: null,
    },
    create: {
      playerId: saved.playerId,
      gameName,
      tagLine,
      puuid: account.puuid,
      summonerId: summoner.id ?? summoner.summonerId ?? summoner.encryptedSummonerId ?? null,
      accountId: summoner.accountId ?? null,
      profileIconId: summoner.profileIconId ?? null,
      summonerLevel: summoner.summonerLevel ?? null,
      isVerified: true,
      verificationMethod: "RSO",
      verifiedByUserAccountId: input.currentUserAccountId,
      verifiedAt: now,
      rsoSubject: account.puuid,
      linkedByUserAccountId: input.currentUserAccountId,
      linkedAt: now,
      syncStatus: "IDLE",
    },
  });

  await recordRiotAccountLinkLog({
    playerId: saved.playerId,
    userAccountId: input.currentUserAccountId,
    action: "USER_RSO_VERIFY",
    actorType: "USER",
    gameName,
    tagLine,
    puuid: account.puuid,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    message: "Riot Sign On으로 Riot 계정 본인 소유 인증 완료",
  });

  return {
    ok: true as const,
    status: 200,
    redirectTo: buildRedirectPath(returnTo, { rso: "success" }),
    message: "Riot 계정 본인 소유 인증이 완료되었습니다.",
  };
}
