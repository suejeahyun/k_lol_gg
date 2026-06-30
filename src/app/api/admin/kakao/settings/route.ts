export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdminRequest } from "@/lib/auth/requireAdmin";
import { writeAdminLog } from "@/lib/admin-log";
import { getKakaoOperationSettings, saveKakaoOperationSettings } from "@/lib/kakao/settings";

export async function GET() {
  const admin = await requireAdminRequest();
  if (!admin) return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 401 });

  const settings = await getKakaoOperationSettings();
  return NextResponse.json({ ok: true, settings });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdminRequest();
  if (!admin) return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 401 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const settings = await saveKakaoOperationSettings({ value: body, updatedById: admin.user.id });

  await writeAdminLog({
    action: "KAKAO_OPERATION_SETTINGS_UPDATED",
    message: "카카오톡 세부 운영 설정 변경",
    actorId: admin.user.id,
    actorType: admin.user.role,
    afterJson: JSON.parse(JSON.stringify(settings)),
  }).catch(() => null);

  return NextResponse.json({ ok: true, settings });
}
