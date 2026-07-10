import { NextResponse } from "next/server";
import { getPublicSiteSettings, getSiteSettings } from "@/lib/site/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await getSiteSettings();
  return NextResponse.json({
    ok: true,
    settings: getPublicSiteSettings(settings),
  });
}
