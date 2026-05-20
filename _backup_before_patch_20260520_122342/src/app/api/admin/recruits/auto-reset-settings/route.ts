export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";
import { getRequestAuditFields, writeAdminLog } from "@/lib/admin-log";
import {
  MAX_RECRUIT_IDLE_RESET_HOURS,
  MIN_RECRUIT_IDLE_RESET_HOURS,
  getRecruitAutoResetSettings,
  saveRecruitAutoResetSettings,
} from "@/lib/kakao/recruit-auto-reset";

function parseIdleHours(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return NaN;
  return Math.floor(parsed);
}

export async function GET() {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  const settings = await getRecruitAutoResetSettings();
  return NextResponse.json({ ok: true, settings });
}

export async function POST(req: NextRequest) {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const enabled = body.enabled !== false;
    const idleHours = parseIdleHours(body.idleHours);

    if (!Number.isInteger(idleHours) || idleHours < MIN_RECRUIT_IDLE_RESET_HOURS || idleHours > MAX_RECRUIT_IDLE_RESET_HOURS) {
      return NextResponse.json(
        {
          ok: false,
          message: `활동 없음 기준 시간은 ${MIN_RECRUIT_IDLE_RESET_HOURS}~${MAX_RECRUIT_IDLE_RESET_HOURS}시간 사이로 입력해야 합니다.`,
        },
        { status: 400 },
      );
    }

    const audit = getRequestAuditFields(req);
    const saved = await saveRecruitAutoResetSettings({ enabled, idleHours });

    await writeAdminLog({
      action: "ADMIN_PARTY_RECRUIT_AUTO_RESET_SETTING_UPDATE",
      message: `구인구직 자동 모집번호 초기화 설정 변경: ${enabled ? "사용" : "미사용"}, ${idleHours}시간`,
      targetType: "RecruitPartyLog",
      targetId: saved.id,
      afterJson: { enabled, idleHours },
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    });

    return NextResponse.json({
      ok: true,
      message: `자동 모집번호 초기화 설정을 저장했습니다. 현재 설정: ${enabled ? "사용" : "미사용"}, ${idleHours}시간`,
      settings: { enabled, idleHours },
    });
  } catch (error) {
    console.error("[ADMIN_RECRUITS_AUTO_RESET_SETTINGS_ERROR]", error);
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "자동 모집번호 초기화 설정 저장 실패",
      },
      { status: 500 },
    );
  }
}
