import { NextRequest, NextResponse } from "next/server";
import { getAdminLogsStatsDashboardData } from "@/lib/admin/logs-stats-dashboard-data";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const days = Number(request.nextUrl.searchParams.get("days") ?? "30");
  const data = await getAdminLogsStatsDashboardData({ days });
  return NextResponse.json(data);
}
