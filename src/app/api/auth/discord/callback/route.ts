export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { authConstants } from "@/lib/auth";
import { signAuthToken } from "@/lib/auth/token";
import { writeAdminLog } from "@/lib/admin-log";
import { buildDiscordAvatarUrl, parseDiscordCommunityNickname, scorePlayerDiscordMatch } from "@/lib/discord/nickname";

function getBaseUrl(req: NextRequest) {
  return process.env.NEXT_PUBLIC_BASE_URL || `${req.nextUrl.protocol}//${req.nextUrl.host}`;
}

function parseState(value: string | null) {
  if (!value) return { next: "/" };
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    const next = typeof parsed.next === "string" && parsed.next.startsWith("/") ? parsed.next : "/";
    return { next };
  } catch {
    return { next: "/" };
  }
}

type DiscordUserPayload = {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
};

async function fetchDiscordUser(params: { code: string; redirectUri: string }) {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("DISCORD_CLIENT_ID 또는 DISCORD_CLIENT_SECRET 환경변수가 필요합니다.");
  }

  const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code: params.code,
      redirect_uri: params.redirectUri,
    }),
    cache: "no-store",
  });

  if (!tokenRes.ok) {
    throw new Error(`Discord 토큰 요청 실패: ${tokenRes.status}`);
  }

  const tokenData = (await tokenRes.json()) as { access_token?: string; token_type?: string };
  if (!tokenData.access_token) throw new Error("Discord access token이 없습니다.");

  const userRes = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `${tokenData.token_type || "Bearer"} ${tokenData.access_token}` },
    cache: "no-store",
  });

  if (!userRes.ok) {
    throw new Error(`Discord 사용자 조회 실패: ${userRes.status}`);
  }

  return (await userRes.json()) as DiscordUserPayload;
}

async function findBestPlayerCandidate(parsed: ReturnType<typeof parseDiscordCommunityNickname>) {
  const orConditions = [
    parsed.name ? { name: { equals: parsed.name, mode: "insensitive" as const } } : null,
    parsed.nickname ? { nickname: { equals: parsed.nickname, mode: "insensitive" as const } } : null,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));

  if (orConditions.length === 0) return null;

  const players = await prisma.player.findMany({
    where: {
      isActive: true,
      OR: orConditions,
    },
    include: { userAccount: true },
    take: 10,
  });

  const scored = players
    .map((player) => ({
      player,
      score: scorePlayerDiscordMatch({
        parsedName: parsed.name,
        parsedNickname: parsed.nickname,
        parsedTier: parsed.tier,
        player,
      }),
    }))
    .sort((a, b) => b.score - a.score);

  return scored[0] && scored[0].score >= 80 ? scored[0] : null;
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = parseState(req.nextUrl.searchParams.get("state"));
  const baseUrl = getBaseUrl(req);
  const redirectUri = process.env.DISCORD_REDIRECT_URI || `${baseUrl}/api/auth/discord/callback`;

  if (!code) {
    return NextResponse.redirect(`${baseUrl}/login?discord=missing_code`);
  }

  try {
    const discordUser = await fetchDiscordUser({ code, redirectUri });
    const displayName = discordUser.global_name || discordUser.username;
    const parsed = parseDiscordCommunityNickname(displayName);
    const avatarUrl = buildDiscordAvatarUrl(discordUser.id, discordUser.avatar);

    const discordGeneratedUserId = `discord_${discordUser.id}`;

    let user = await prisma.userAccount.findUnique({
      where: { discordId: discordUser.id },
      include: { player: true },
    });

    if (!user) {
      /*
       * 기존 운영 중 수동 연결/이전 과정에서 discordId는 비어 있지만
       * discordUsername 또는 discordGlobalName만 기존 계정에 남아 있는 경우가 있습니다.
       * 이 경우 새 계정을 만들면 userId=discord_<id> 중복 또는 승인대기 계정 분리 문제가 생기므로,
       * 먼저 기존 계정 후보를 찾아 discordId를 붙입니다.
       */
      user = await prisma.userAccount.findFirst({
        where: {
          discordId: null,
          status: { not: "REJECTED" },
          OR: [
            { discordUsername: discordUser.username },
            discordUser.global_name ? { discordGlobalName: discordUser.global_name } : undefined,
            { discordServerNickname: displayName },
          ].filter((item): item is NonNullable<typeof item> => Boolean(item)),
        },
        include: { player: true },
        orderBy: [{ status: "asc" }, { id: "asc" }],
      });
    }

    if (!user) {
      user = await prisma.userAccount.findUnique({
        where: { userId: discordGeneratedUserId },
        include: { player: true },
      });
    }

    if (!user) {
      const candidate = await findBestPlayerCandidate(parsed);
      user = await prisma.$transaction(async (tx) => {
        let created = await tx.userAccount.create({
          data: {
            userId: discordGeneratedUserId,
            passwordHash: null,
            role: "USER",
            status: "PENDING",
            discordId: discordUser.id,
            discordUsername: discordUser.username,
            discordGlobalName: discordUser.global_name || null,
            discordServerNickname: displayName,
            discordAvatar: avatarUrl,
            discordLinkedAt: new Date(),
            discordParsedBirthYear: parsed.birthYear,
            discordParsedName: parsed.name,
            discordParsedNickname: parsed.nickname,
            discordParsedTier: parsed.tier,
            discordLinkStatus: candidate ? "CANDIDATE" : "UNMATCHED",
          },
        });

        if (candidate?.player && !candidate.player.userAccountId) {
          await tx.player.update({
            where: { id: candidate.player.id },
            data: { userAccountId: created.id },
          });
          created = await tx.userAccount.update({
            where: { id: created.id },
            data: { discordLinkStatus: "PENDING_ADMIN_CONFIRM" },
          });
        }

        await writeAdminLog({
          action: "DISCORD_SIGNUP_OR_LINK",
          message: `Discord 로그인/가입: ${displayName} (${discordUser.id})`,
          targetType: "UserAccount",
          targetId: created.id,
          afterJson: { parsed, candidatePlayerId: candidate?.player.id ?? null, score: candidate?.score ?? null },
          db: tx,
        });

        return tx.userAccount.findUniqueOrThrow({ where: { id: created.id }, include: { player: true } });
      });
    } else {
      user = await prisma.userAccount.update({
        where: { id: user.id },
        data: {
          discordId: discordUser.id,
          discordUsername: discordUser.username,
          discordGlobalName: discordUser.global_name || null,
          discordServerNickname: displayName,
          discordAvatar: avatarUrl,
          discordLinkedAt: user.discordLinkedAt ?? new Date(),
          discordParsedBirthYear: parsed.birthYear,
          discordParsedName: parsed.name,
          discordParsedNickname: parsed.nickname,
          discordParsedTier: parsed.tier,
          discordLinkStatus: user.discordLinkStatus || "LINKED",
        },
        include: { player: true },
      });
    }

    const token = signAuthToken({
      userAccountId: user.id,
      userId: user.userId,
      role: user.role,
      status: user.status,
      playerId: user.player?.id ?? null,
    });

    const res = NextResponse.redirect(`${baseUrl}${state.next}`);
    res.cookies.set("user_token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    res.cookies.set(authConstants.ADMIN_TOKEN_KEY, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });

    return res;
  } catch (error) {
    console.error("[DISCORD_AUTH_CALLBACK_ERROR]", error);
    return NextResponse.redirect(`${baseUrl}/login?discord=failed`);
  }
}
