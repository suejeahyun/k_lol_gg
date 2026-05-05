import { prisma } from "@/lib/prisma/client";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";
import { createCsvResponse } from "@/lib/csv";

export async function GET() {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  const players = await prisma.player.findMany({
    orderBy: { id: "asc" },
    include: { userAccount: { select: { userId: true, status: true } } },
  });

  return createCsvResponse(
    `players-${new Date().toISOString().slice(0, 10)}.csv`,
    ["id", "name", "nickname", "tag", "currentTier", "peakTier", "userId", "userStatus", "createdAt"],
    players.map((player) => [
      player.id,
      player.name,
      player.nickname,
      player.tag,
      player.currentTier ?? "",
      player.peakTier ?? "",
      player.userAccount?.userId ?? "",
      player.userAccount?.status ?? "",
      player.createdAt.toISOString(),
    ]),
  );
}
