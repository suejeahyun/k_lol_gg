import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma/client";
import { requireAdminRequest } from "@/lib/auth/requireAdmin";
import PlayerManageDetailClient from "./PlayerManageDetailClient";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ playerId: string }>;
};

export default async function AdminPlayerDetailPage({ params }: Props) {
  const admin = await requireAdminRequest();
  if (!admin) redirect("/admin/login");

  const { playerId } = await params;
  const id = Number(playerId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const player = await prisma.player.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      nickname: true,
      tag: true,
      peakTier: true,
      currentTier: true,
      balanceOverrideScore: true,
      balanceOverrideReason: true,
      isActive: true,
      deactivatedAt: true,
      createdAt: true,
      userAccount: {
        select: {
          id: true,
          userId: true,
          role: true,
          status: true,
          createdAt: true,
          adminTotpEnabled: true,
          adminTotpEnabledAt: true,
          discordId: true,
          discordUsername: true,
          discordGlobalName: true,
          discordServerNickname: true,
          discordLinkedAt: true,
          discordLinkStatus: true,
        },
      },
      _count: {
        select: {
          participants: true,
          seasonStats: true,
          championStats: true,
          destructionParticipants: true,
          eventParticipants: true,
          disciplineRecords: true,
        },
      },
    },
  });

  if (!player) notFound();

  return (
    <PlayerManageDetailClient
      player={{
        ...player,
        createdAt: player.createdAt.toISOString(),
        deactivatedAt: player.deactivatedAt?.toISOString() ?? null,
        userAccount: player.userAccount
          ? {
              ...player.userAccount,
              createdAt: player.userAccount.createdAt.toISOString(),
              adminTotpEnabledAt: player.userAccount.adminTotpEnabledAt?.toISOString() ?? null,
              adminTotpSetupPending: false,
              discordLinkedAt: player.userAccount.discordLinkedAt?.toISOString() ?? null,
            }
          : null,
      }}
      currentAdmin={{
        id: admin.user.id,
        userId: admin.user.userId,
        role: admin.user.role,
      }}
    />
  );
}
