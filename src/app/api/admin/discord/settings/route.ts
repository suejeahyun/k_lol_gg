export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdminRequest } from "@/lib/auth/requireAdmin";
import { getDiscordOperationSettings, saveDiscordOperationSettings } from "@/lib/discord/settings";
import { writeAdminLog } from "@/lib/admin-log";

export async function GET() {
  const admin = await requireAdminRequest();
  if (!admin) return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 401 });
  return NextResponse.json({ ok: true, settings: await getDiscordOperationSettings() });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdminRequest();
  if (!admin) return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 401 });
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const settings = await saveDiscordOperationSettings({ value: body, updatedById: admin.user.id });
  await writeAdminLog({ action: "DISCORD_OPERATION_SETTINGS_UPDATED", message: "Discord 운영 설정 변경", actorId: admin.user.id, actorType: admin.user.role, afterJson: JSON.parse(JSON.stringify(settings)) });
  return NextResponse.json({ ok: true, settings });
}
