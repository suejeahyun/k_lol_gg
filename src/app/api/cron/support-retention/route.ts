import { verifyVercelCronBearer } from "@/modules/operations/infrastructure/vercel-kakao-daily-close";
import { getRuntimeOperationForms } from "@/modules/recruiting/operation-forms/runtime";
import { noStoreJsonResponse } from "@/platform/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (new URL(request.url).search || !verifyVercelCronBearer(request.headers.get("authorization"), process.env.CRON_SECRET)) return noStoreJsonResponse({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const service = getRuntimeOperationForms();
    if (!service) throw new Error("UNAVAILABLE");
    let removed = 0;
    for (let batch = 0; batch < 10; batch += 1) {
      const count = await service.purgeExpiredSupport();
      removed += count;
      if (count < 100) break;
    }
    return noStoreJsonResponse({ removed }, { status: 200 });
  } catch { return noStoreJsonResponse({ error: "UNAVAILABLE" }, { status: 503 }); }
}
