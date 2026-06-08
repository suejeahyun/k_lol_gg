export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { requireAdminRequest } from "@/lib/auth/requireAdmin";

export async function GET() {
  const admin = await requireAdminRequest();
  if (!admin) {
    return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 401 });
  }

  const parties = await prisma.recruitParty.findMany({
    where: { status: "IN_PROGRESS" },
    include: {
      members: { orderBy: [{ slotNo: "asc" }, { createdAt: "asc" }] },
      discordMonitor: true,
    },
    orderBy: [{ updatedAt: "desc" }],
    take: 50,
  });

  return NextResponse.json({
    parties: parties.map((party) => ({
      id: party.id,
      recruitNo: party.recruitNo,
      title: party.title,
      maxMembers: party.maxMembers,
      memberCount: party.members.filter((member) => member.name.trim() !== "" && !member.isSubstitute).length,
      updatedAt: party.updatedAt.toISOString(),
      monitor: party.discordMonitor
        ? {
            voiceChannelId: party.discordMonitor.voiceChannelId,
            status: party.discordMonitor.status,
            lastExpectedCount: party.discordMonitor.lastExpectedCount,
            lastPresentExpectedCount: party.discordMonitor.lastPresentExpectedCount,
            lastNonParticipantCount: party.discordMonitor.lastNonParticipantCount,
            finishCandidateStartedAt: party.discordMonitor.finishCandidateStartedAt?.toISOString() ?? null,
            lastScannedAt: party.discordMonitor.lastScannedAt?.toISOString() ?? null,
            autoFinishedAt: party.discordMonitor.autoFinishedAt?.toISOString() ?? null,
            autoFinishReason: party.discordMonitor.autoFinishReason,
          }
        : null,
    })),
  });
}
