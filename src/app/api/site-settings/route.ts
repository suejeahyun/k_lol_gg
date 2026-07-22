import { NextResponse } from "next/server";
import { getPublicSiteSettings, getSiteSettings } from "@/lib/site/settings";
import { PUBLIC_SHORT_CACHE_HEADER } from "@/lib/http/cache";

export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await getSiteSettings();
  return NextResponse.json(
    {
      ok: true,
      settings: getPublicSiteSettings(settings),
    },
    { headers: { "Cache-Control": PUBLIC_SHORT_CACHE_HEADER } },
  );
}
