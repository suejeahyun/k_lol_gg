export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";
import { getRequestAuditFields, writeAdminLog } from "@/lib/admin-log";
import { prisma } from "@/lib/prisma/client";

export async function POST(req: NextRequest) {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  try {
    const audit = getRequestAuditFields(req);

    const result = await prisma.$transaction(async (tx) => {
      const [activePartyCount, totalPartyCount, memberCount, logCount] = await Promise.all([
        tx.recruitParty.count({ where: { status: "IN_PROGRESS" } }),
        tx.recruitParty.count(),
        tx.recruitPartyMember.count(),
        tx.recruitPartyLog.count(),
      ]);

      await tx.recruitPartyMember.deleteMany();
      await tx.recruitParty.deleteMany();
      await tx.recruitPartyLog.deleteMany();

      await writeAdminLog({
        action: "KAKAO_PARTY_RECRUIT_RESET_ALL",
        message: `카카오 구인구직 전체 초기화: 진행 중 ${activePartyCount}개 / 전체 구인 ${totalPartyCount}개 / 참가자 ${memberCount}명 / 기록 ${logCount}개 삭제`,
        targetType: "RecruitParty",
        beforeJson: {
          activePartyCount,
          totalPartyCount,
          memberCount,
          logCount,
        },
        afterJson: {
          activePartyCount: 0,
          totalPartyCount: 0,
          memberCount: 0,
          logCount: 0,
        },
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
        db: tx,
      });

      return {
        activePartyCount,
        totalPartyCount,
        memberCount,
        logCount,
      };
    });

    return NextResponse.json({
      ok: true,
      message: "카카오 구인구직 전체 초기화가 완료되었습니다.",
      result,
    });
  } catch (error) {
    console.error("[ADMIN_RECRUITS_RESET_ALL_ERROR]", error);
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "카카오 구인구직 전체 초기화 실패",
      },
      { status: 500 },
    );
  }
}
