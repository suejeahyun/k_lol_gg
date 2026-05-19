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

      const updated = await tx.recruitParty.updateMany({
        where: { status: "IN_PROGRESS" },
        data: { status: "RESET" },
      });

      const resetLog = await tx.recruitPartyLog.create({
        data: {
          recruitNo: 0,
          recruitDate: "",
          resetSeq: 0,
          type: "SYSTEM",
          title: "관리자 전체 구인 초기화",
          action: "ADMIN_RESET_ALL",
          memberCount,
          maxMembers: 0,
          summary: `관리자 페이지에서 진행 중 구인 ${updated.count}개를 RESET 상태로 보관 처리했습니다. 참가자와 처리 기록은 삭제하지 않았습니다.`,
          roomName: "admin",
          sender: "admin",
        },
      });

      await writeAdminLog({
        action: "KAKAO_PARTY_RECRUIT_ARCHIVE_ALL",
        message: `카카오 구인구직 전체 초기화: 진행 중 ${updated.count}개 보관 처리 / 전체 구인 ${totalPartyCount}개 / 참가자 ${memberCount}명 / 기록 ${logCount}개 유지`,
        targetType: "RecruitParty",
        targetId: resetLog.id,
        beforeJson: {
          activePartyCount,
          totalPartyCount,
          memberCount,
          logCount,
        },
        afterJson: {
          activePartyCount: 0,
          archivedPartyCount: updated.count,
          totalPartyCount,
          memberCount,
          logCount: logCount + 1,
        },
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
        db: tx,
      });

      return {
        activePartyCount,
        archivedPartyCount: updated.count,
        totalPartyCount,
        memberCount,
        logCount: logCount + 1,
      };
    });

    return NextResponse.json({
      ok: true,
      message: "카카오 구인구직 전체 초기화가 완료되었습니다. 기존 기록은 DB에 보관했습니다.",
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
