export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { PUBLIC_SHORT_CACHE_HEADER } from "@/lib/http/cache";

export async function GET() {
  const season = await prisma.season.findFirst({
    where: { isActive: true },
    orderBy: { id: "desc" },
  });

  return NextResponse.json(season, {
    headers: { "Cache-Control": PUBLIC_SHORT_CACHE_HEADER },
  });
}
