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
    scope: "identify guilds.members.read",
    state,
    prompt: mode === "link" ? "consent" : "none",
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
