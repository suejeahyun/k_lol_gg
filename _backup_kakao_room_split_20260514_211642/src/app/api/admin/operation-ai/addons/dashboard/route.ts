export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdminRequest } from "@/lib/auth/requireAdmin";
import { buildOperationAiAddonDashboard } from "@/lib/operation-ai/addons/analytics";

export async function GET(req: NextRequest) {
  try {
    const admin = await requireAdminRequest();
    if (!admin) {
      return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 401 });
    }

    const dateKey = req.nextUrl.searchParams.get("date");
    const dashboard = await buildOperationAiAddonDashboard(dateKey);

    return NextResponse.json(dashboard, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[OPERATION_AI_ADDON_DASHBOARD_ERROR]", error);
    return NextResponse.json(
      { message: "운영 AI 확장 대시보드 조회 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
