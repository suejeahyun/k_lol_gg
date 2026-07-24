import { NextResponse } from "next/server";
import { rejectIfNotAdmin, rejectIfNotSuperAdmin } from "@/lib/auth/requireAdmin";
import { writeAdminLog } from "@/lib/admin-log";
import {
  getKakaoRecruitHealth,
  repairSafeKakaoRecruitData,
} from "@/lib/kakao/recruit-health";
import { requireSiteFeature } from "@/lib/site/feature-guard";
import { logServerError } from "@/lib/server/safe-log";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  const premiumLock = await requireSiteFeature("recruit");
  if (premiumLock) return premiumLock;

  try {
    return NextResponse.json(await getKakaoRecruitHealth());
  } catch (error) {
    logServerError("[KAKAO_RECRUIT_HEALTH_ERROR]", error);
    return NextResponse.json(
      { ok: false, message: "카카오 구인 데이터 진단에 실패했습니다." },
      { status: 500 },
    );
  }
}

export async function POST() {
  const rejected = await rejectIfNotSuperAdmin();
  if (rejected) return rejected;

  const premiumLock = await requireSiteFeature("recruit");
  if (premiumLock) return premiumLock;

  try {
    const repaired = await repairSafeKakaoRecruitData();
    await writeAdminLog({
      action: "KAKAO_RECRUIT_SAFE_REPAIR",
      message: "카카오 구인 안전 복구를 실행했습니다.",
      actorType: "ADMIN",
      afterJson: repaired,
    });

    return NextResponse.json({
      ok: true,
      repaired,
      health: await getKakaoRecruitHealth(),
    });
  } catch (error) {
    logServerError("[KAKAO_RECRUIT_SAFE_REPAIR_ERROR]", error);
    return NextResponse.json(
      { ok: false, message: "카카오 구인 데이터 안전 복구에 실패했습니다." },
      { status: 500 },
    );
  }
}
