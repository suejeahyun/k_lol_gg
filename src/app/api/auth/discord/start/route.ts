export const dynamic = "force-dynamic";

import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";

function getBaseUrl(req: NextRequest) {
  return process.env.NEXT_PUBLIC_BASE_URL || `${req.nextUrl.protocol}//${req.nextUrl.host}`;
}

function safeNext(value: string | null) {
  return value && value.startsWith("/") ? value : "/";
}

export async function GET(req: NextRequest) {
  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ message: "DISCORD_CLIENT_ID 환경변수가 필요합니다." }, { status: 500 });
  }

  const mode = req.nextUrl.searchParams.get("mode") === "link" ? "link" : "login";
  const currentUser = await getCurrentUser();
  if (mode === "link" && !currentUser?.userAccountId) {
    return NextResponse.redirect(`${getBaseUrl(req)}/login?next=/account`);
  }

  const baseUrl = getBaseUrl(req);
  const redirectUri = process.env.DISCORD_REDIRECT_URI || `${baseUrl}/api/auth/discord/callback`;
  const nonce = crypto.randomBytes(16).toString("hex");
  const statePayload = {
    next: safeNext(req.nextUrl.searchParams.get("next")) || (mode === "link" ? "/account" : "/"),
    mode,
    userAccountId: mode === "link" ? currentUser?.userAccountId ?? null : null,
    nonce,
    issuedAt: Date.now(),
  };
  const state = Buffer.from(JSON.stringify(statePayload)).toString("base64url");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    // 현재 콜백에서는 /users/@me만 사용하므로 identify만 요청합니다.
    // guilds.members.read는 불필요한 권한이며, 앱/유저 상태에 따라 OAuth 동의 실패 원인이 될 수 있습니다.
    scope: "identify",
    state,
    // prompt=none은 신규 사용자/미동의 사용자에게 code 없이 돌아오는 원인이 됩니다.
    // 로그인과 계정 연동 모두 명시적으로 동의 화면을 띄웁니다.
    prompt: "consent",
  });

  const res = NextResponse.redirect(`https://discord.com/oauth2/authorize?${params.toString()}`);
  res.cookies.set("discord_oauth_state", nonce, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10,
  });
  return res;
}
