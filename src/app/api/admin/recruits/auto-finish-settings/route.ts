import { requireSiteFeature } from "@/lib/site/feature-guard";
import { logServerError } from "@/lib/server/safe-log";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";
import { getRequestAuditFields, writeAdminLog } from "@/lib/admin-log";
import {
  MAX_RECRUIT_IDLE_FINISH_HOURS,
  MIN_RECRUIT_IDLE_FINISH_HOURS,
  getRecruitIdleAutoFinishSettings,
  saveRecruitIdleAutoFinishSettings,
} from "@/lib/kakao/recruit-idle-auto-finish";

function parseIdleHours(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return NaN;
  return Math.floor(parsed);
}

export async function GET() {
  const premiumLock = await requireSiteFeature("recruit");
  if (premiumLock) return premiumLock;

  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  const settings = await getRecruitIdleAutoFinishSettings();
  return NextResponse.json({ ok: true, settings });
}

export async function POST(req: NextRequest) {
  const premiumLock = await requireSiteFeature("recruit");
  if (premiumLock) return premiumLock;

  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const enabled = body.enabled === true;
    const idleHours = parseIdleHours(body.idleHours);

    if (!Number.isInteger(idleHours) || idleHours < MIN_RECRUIT_IDLE_FINISH_HOURS || idleHours > MAX_RECRUIT_IDLE_FINISH_HOURS) {
      return NextResponse.json(
        {
          ok: false,
          message: `활동 없음 자동종료 기준 시간은 ${MIN_RECRUIT_IDLE_FINISH_HOURS}~${MAX_RECRUIT_IDLE_FINISH_HOURS}시간 사이로 입력해야 합니다.`,
        },
        { status: 400 },
      );
    }

    const audit = getRequestAuditFields(req);
    const saved = await saveRecruitIdleAutoFinishSettings({ enabled, idleHours });

    await writeAdminLog({
      action: "ADMIN_PARTY_RECRUIT_AUTO_IDLE_FINISH_SETTING_UPDATE",
      message: `구인구직 활동 없음 자동종료 설정 변경: ${enabled ? "사용" : "미사용"}, ${idleHours}시간`,
      targetType: "RecruitPartyLog",
      targetId: saved.id,
      afterJson: { enabled, idleHours },
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    });

    return NextResponse.json({
      ok: true,
      message: `활동 없음 자동종료 설정을 저장했습니다. 현재 설정: ${enabled ? "사용" : "미사용"}, ${idleHours}시간`,
      settings: { enabled, idleHours },
    });
  } catch (error) {
    logServerError("[ADMIN_RECRUITS_AUTO_IDLE_FINISH_SETTINGS_ERROR]", error);
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "활동 없음 자동종료 설정 저장 실패",
      },
      { status: 500 },
    );
  }
}
