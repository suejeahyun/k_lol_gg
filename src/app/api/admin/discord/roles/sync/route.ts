export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdminRequest } from "@/lib/auth/requireAdmin";
import { writeAdminLog } from "@/lib/admin-log";

export async function POST() {
  const admin = await requireAdminRequest();
  if (!admin) return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 401 });

  await writeAdminLog({
    action: "DISCORD_ROLE_SYNC_REQUESTED",
    message: "Discord 역할 전체 동기화 요청. 봇 서버에서 DISCORD_ROLE_SYNC_ENABLED 기능을 활성화하면 이 로그를 기준으로 동기화할 수 있습니다.",
    actorId: admin.user.id,
    actorType: admin.user.role,
  });

  return NextResponse.json({ ok: true, message: "역할 동기화 요청 로그를 남겼습니다. 실제 역할 지급은 봇 권한/역할 ID 설정 후 활성화하세요." });
}
