export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

export async function GET() {
  const parties = await prisma.recruitParty.findMany({
    where: { status: "IN_PROGRESS" },
    include: {
      members: {
        orderBy: [{ slotNo: "asc" }, { createdAt: "asc" }],
      },
    },
    orderBy: [{ recruitNo: "asc" }],
  });

  return NextResponse.json({ ok: true, parties });
}
