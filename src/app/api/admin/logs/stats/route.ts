import { NextRequest, NextResponse } from "next/server";
import { rejectIfNotSuperAdmin } from "@/lib/auth/requireAdmin";
import { getAdminLogsStatsDashboardData } from "@/lib/admin/logs-stats-dashboard-data";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const rejected = await rejectIfNotSuperAdmin();
  if (rejected) return rejected;

  const days = Number(request.nextUrl.searchParams.get("days") ?? "30");
  const data = await getAdminLogsStatsDashboardData({ days });
  return NextResponse.json(data);
}
