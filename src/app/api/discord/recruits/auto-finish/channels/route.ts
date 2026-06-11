export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { rejectIfInvalidDiscordBotSecret } from "@/lib/discord/secret";

export async function GET(req: NextRequest) {
  const rejected = rejectIfInvalidDiscordBotSecret(req, req.nextUrl.searchParams.get("secret"));
  if (rejected) return rejected;

  const monitors = await prisma.recruitPartyDiscordMonitor.findMany({
    where: {
      voiceChannelId: { not: null },
      party: { status: "IN_PROGRESS" },
      OR: [
        { status: { in: ["PARTIAL_ACTIVE", "PARTIAL_ACTIVE_WITH_EXTRA", "GATHERING", "ASSEMBLED", "ASSEMBLED_WITH_EXTRA", "FINISH_CANDIDATE"] } },
        { lastPresentExpectedCount: { gt: 0 } },
        { finishCandidateStartedAt: { not: null } },
      ],
    },
    select: {
      voiceChannelId: true,
      status: true,
      lastPresentExpectedCount: true,
      finishCandidateStartedAt: true,
      party: {
        select: {
          recruitNo: true,
          title: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });

  const channelIds = Array.from(
    new Set(
      monitors
        .map((monitor) => monitor.voiceChannelId)
        .filter((channelId): channelId is string => Boolean(channelId)),
    ),
  );

  return NextResponse.json({
    ok: true,
    channelIds,
    monitors: monitors.map((monitor) => ({
      channelId: monitor.voiceChannelId,
      status: monitor.status,
      lastPresentExpectedCount: monitor.lastPresentExpectedCount,
      finishCandidateStartedAt: monitor.finishCandidateStartedAt?.toISOString() ?? null,
      recruitNo: monitor.party.recruitNo,
      title: monitor.party.title,
    })),
    serverTime: new Date().toISOString(),
  });
}
