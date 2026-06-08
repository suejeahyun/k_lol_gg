export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

function getBaseUrl(req: NextRequest) {
  return process.env.NEXT_PUBLIC_BASE_URL || `${req.nextUrl.protocol}//${req.nextUrl.host}`;
}

export async function GET(req: NextRequest) {
  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ message: "DISCORD_CLIENT_ID 환경변수가 필요합니다." }, { status: 500 });
  }

  const baseUrl = getBaseUrl(req);
  const redirectUri = process.env.DISCORD_REDIRECT_URI || `${baseUrl}/api/auth/discord/callback`;
  const next = req.nextUrl.searchParams.get("next") || "/";
  const state = Buffer.from(JSON.stringify({ next })).toString("base64url");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "identify guilds.members.read",
    state,
    prompt: "none",
  });

  return NextResponse.redirect(`https://discord.com/oauth2/authorize?${params.toString()}`);
}
