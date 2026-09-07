import { sql } from "drizzle-orm";

import { getDatabase } from "@/platform/db/client";
import { noStoreJsonResponse, readValidatedTraceId } from "@/platform/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const traceId = readValidatedTraceId(request.headers);
  const checkedAt = new Date().toISOString();
  if (new URL(request.url).searchParams.size > 0) return noStoreJsonResponse({ status: "degraded", checkedAt }, { status: 400, traceId });
  try {
    await getDatabase().execute(sql`select 1`);
    return noStoreJsonResponse({ status: "ready", checkedAt }, { traceId });
  } catch {
    return noStoreJsonResponse({ status: "degraded", checkedAt }, { status: 503, traceId });
  }
}
