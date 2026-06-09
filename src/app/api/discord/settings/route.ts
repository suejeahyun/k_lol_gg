export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { rejectIfInvalidDiscordBotSecret } from "@/lib/discord/secret";
import { getDiscordOperationSettings } from "@/lib/discord/settings";

export async function GET(req: NextRequest) {
  const rejected = rejectIfInvalidDiscordBotSecret(req, req.nextUrl.searchParams.get("secret"));
  if (rejected) return rejected;
  const settings = await getDiscordOperationSettings();
  return NextResponse.json({ ok: true, settings, serverTime: new Date().toISOString() });
}
