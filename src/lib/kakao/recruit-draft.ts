import { prisma } from "@/lib/prisma/client";

export const PARTY_RECRUIT_DRAFT_TTL_MS = 15 * 60 * 1000;

/** Removes only unsubmitted form reservations; they were never public recruits. */
export async function expirePartyRecruitDrafts(now = new Date()) {
  return prisma.recruitParty.deleteMany({
    where: {
      status: "DRAFT",
      createdAt: { lt: new Date(now.getTime() - PARTY_RECRUIT_DRAFT_TTL_MS) },
    },
  });
}
