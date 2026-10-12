import { getRuntimePrivateImageStorage } from "@/modules/matches/infrastructure/runtime-private-assets";
import { runSecurityMaintenance } from "@/modules/operations/infrastructure/security-maintenance";
import { verifyVercelCronBearer } from "@/modules/operations/infrastructure/vercel-kakao-daily-close";
import { getDatabase } from "@/platform/db/client";
import { noStoreJsonResponse } from "@/platform/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (new URL(request.url).search || !verifyVercelCronBearer(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return noStoreJsonResponse({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  try {
    const result = await runSecurityMaintenance(getDatabase(), getRuntimePrivateImageStorage());
    return noStoreJsonResponse(result, { status: "failed" in result && result.failed ? 503 : 200 });
  } catch { return noStoreJsonResponse({ error: "UNAVAILABLE" }, { status: 503 }); }
}
