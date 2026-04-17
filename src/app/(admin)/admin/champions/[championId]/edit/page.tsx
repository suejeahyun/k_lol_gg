import EditChampionClient from "./champion-edit-client";
import { prisma } from "@/lib/prisma/client";

type Props = {
  params: Promise<{ championId: string }>;
};

export default async function AdminChampionEditPage({ params }: Props) {
  const { championId } = await params;
  const id = Number(championId);

  const champion = await prisma.champion.findUnique({
    where: { id },
  });

  if (!champion) {
    throw new Error("Champion not found");
  }

  return <EditChampionClient champion={champion} />;
}