import { NextRequest, NextResponse } from "next/server";

export function rejectIfInvalidDiscordBotSecret(req: NextRequest, bodySecret: unknown) {
  const secret = process.env.DISCORD_BOT_API_SECRET;
  if (!secret) return null;

  const headerSecret = req.headers.get("x-discord-bot-secret");
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const secretText = typeof bodySecret === "string" ? bodySecret : null;

  if (headerSecret === secret || bearer === secret || secretText === secret) {
    return null;
  }

  return NextResponse.json({ message: "Discord bot 인증값이 올바르지 않습니다." }, { status: 401 });
}
