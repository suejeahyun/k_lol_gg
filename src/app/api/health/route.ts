import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma/client";
import { logServerError } from "@/lib/server/safe-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const noStoreHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "CDN-Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
};

export async function GET() {
  const startedAt = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json(
      {
        ok: true,
        status: "ready",
        checks: { database: "ok" },
        checkedAt: new Date().toISOString(),
        latencyMs: Date.now() - startedAt,
      },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    logServerError("[HEALTH_CHECK_ERROR]", error);

    return NextResponse.json(
      {
        ok: false,
        status: "degraded",
        checks: { database: "error" },
        checkedAt: new Date().toISOString(),
        latencyMs: Date.now() - startedAt,
      },
      { status: 503, headers: noStoreHeaders },
    );
  }
}
