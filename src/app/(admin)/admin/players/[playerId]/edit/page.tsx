import { prisma } from "@/lib/prisma/client";
import EditPlayerClient from "./player-edit-client";

type Props = {
  params: Promise<{ playerId: string }>;
};

export default async function AdminPlayerEditPage({ params }: Props) {
  const { playerId } = await params;
  const id = Number(playerId);

  if (Number.isNaN(id)) {
    throw new Error("Invalid playerId");
  }

  const player = await prisma.player.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      nickname: true,
      tag: true,
    },
  });

  if (!player) {
    throw new Error("Player not found");
  }

  return <EditPlayerClient player={player} />;
}