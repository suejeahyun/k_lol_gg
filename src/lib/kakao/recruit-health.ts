import { prisma } from "@/lib/prisma/client";
import { getScrimRecruitDateKey } from "@/lib/kakao/destruction-scrim-recruit";
import { cleanStoredSubstituteName } from "@/lib/kakao/recruit-health-utils";

const ACTIVE_SCRIM_STATUSES = ["RECRUITING", "MATCHED", "CONFIRMED"] as const;

export async function getKakaoRecruitHealth() {
  const operationDate = getScrimRecruitDateKey();
  const [activeParties, substituteMembers, staleScrims, lastDailyClose] =
    await Promise.all([
      prisma.recruitParty.findMany({
        where: { status: "IN_PROGRESS" },
        select: {
          id: true,
          recruitNo: true,
          recruitDate: true,
          title: true,
          updatedAt: true,
        },
        orderBy: [{ recruitNo: "asc" }, { updatedAt: "desc" }],
      }),
      prisma.recruitPartyMember.findMany({
        where: { isSubstitute: true },
        select: {
          id: true,
          partyId: true,
          name: true,
          slotNo: true,
          party: {
            select: {
              recruitNo: true,
              status: true,
            },
          },
        },
        orderBy: { id: "asc" },
      }),
      prisma.destructionScrimRecruit.findMany({
        where: {
          recruitDate: { not: operationDate },
          status: { in: [...ACTIVE_SCRIM_STATUSES] },
        },
        select: {
          id: true,
          scrimNo: true,
          recruitDate: true,
          status: true,
          updatedAt: true,
        },
        orderBy: [{ recruitDate: "asc" }, { scrimNo: "asc" }],
      }),
      prisma.adminLog.findFirst({
        where: { action: "KAKAO_DAILY_CLOSE" },
        orderBy: { createdAt: "desc" },
        select: { id: true, createdAt: true, afterJson: true },
      }),
    ]);

  const partiesByNumber = new Map<number, typeof activeParties>();
  for (const party of activeParties) {
    const matches = partiesByNumber.get(party.recruitNo) ?? [];
    matches.push(party);
    partiesByNumber.set(party.recruitNo, matches);
  }

  const duplicateActivePartyNumbers = [...partiesByNumber.entries()]
    .filter(([, parties]) => parties.length > 1)
    .map(([recruitNo, parties]) => ({ recruitNo, parties }));

  const malformedSubstitutes = substituteMembers
    .map((member) => ({
      ...member,
      cleanedName: cleanStoredSubstituteName(member.name),
    }))
    .filter((member) => member.cleanedName !== member.name.trim());

  const lastDailyCloseAgeHours = lastDailyClose
    ? (Date.now() - lastDailyClose.createdAt.getTime()) / (60 * 60 * 1000)
    : null;

  return {
    checkedAt: new Date().toISOString(),
    operationDate,
    healthy:
      duplicateActivePartyNumbers.length === 0 &&
      malformedSubstitutes.length === 0 &&
      staleScrims.length === 0 &&
      lastDailyCloseAgeHours !== null &&
      lastDailyCloseAgeHours <= 30,
    counts: {
      activeParties: activeParties.length,
      duplicateActivePartyNumbers: duplicateActivePartyNumbers.length,
      malformedSubstitutes: malformedSubstitutes.length,
      staleScrims: staleScrims.length,
    },
    duplicateActivePartyNumbers,
    malformedSubstitutes,
    staleScrims,
    dailyClose: {
      lastRun: lastDailyClose,
      ageHours: lastDailyCloseAgeHours,
      healthy: lastDailyCloseAgeHours !== null && lastDailyCloseAgeHours <= 30,
    },
  };
}

export async function repairSafeKakaoRecruitData() {
  const operationDate = getScrimRecruitDateKey();

  return prisma.$transaction(async (tx) => {
    const candidates = await tx.recruitPartyMember.findMany({
      where: { isSubstitute: true },
      select: { id: true, name: true },
      orderBy: { id: "asc" },
    });

    let deletedMalformedSubstitutes = 0;
    let normalizedSubstitutes = 0;

    for (const candidate of candidates) {
      const cleanedName = cleanStoredSubstituteName(candidate.name);
      if (cleanedName === candidate.name.trim()) continue;

      if (!cleanedName) {
        await tx.recruitPartyMember.delete({ where: { id: candidate.id } });
        deletedMalformedSubstitutes += 1;
      } else {
        await tx.recruitPartyMember.update({
          where: { id: candidate.id },
          data: { name: cleanedName },
        });
        normalizedSubstitutes += 1;
      }
    }

    const staleScrims = await tx.destructionScrimRecruit.updateMany({
      where: {
        recruitDate: { not: operationDate },
        status: { in: [...ACTIVE_SCRIM_STATUSES] },
      },
      data: { status: "COMPLETED" },
    });

    return {
      operationDate,
      deletedMalformedSubstitutes,
      normalizedSubstitutes,
      completedStaleScrims: staleScrims.count,
    };
  });
}
