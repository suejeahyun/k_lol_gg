import { prisma } from "@/lib/prisma/client";

const POSITIONS = ["TOP", "JGL", "MID", "ADC", "SUP"] as const;
const AUTO_MANAGED_STATUSES = ["APPLIED", "CONFIRMED", "RESERVE"] as const;

type AutoManagedStatus = (typeof AUTO_MANAGED_STATUSES)[number];

type ApplicationForAutoReserve = {
  id: number;
  status: AutoManagedStatus | string;
  mainPosition: string;
  createdAt: Date;
};

function isAutoManagedStatus(status: string): status is AutoManagedStatus {
  return (AUTO_MANAGED_STATUSES as readonly string[]).includes(status);
}

function calculateReserveIds(applications: ApplicationForAutoReserve[]) {
  const candidates = applications
    .filter((application) => isAutoManagedStatus(String(application.status)))
    .slice()
    .sort((a, b) => {
      const createdAtDiff = a.createdAt.getTime() - b.createdAt.getTime();
      if (createdAtDiff !== 0) return createdAtDiff;
      return a.id - b.id;
    });

  const teamCount = candidates.length >= 5 ? Math.floor(candidates.length / 5) : 0;
  const capacity = teamCount * 5;
  const reserveIds = new Set<number>();

  if (teamCount === 0) {
    return {
      teamCount,
      capacity,
      reserveIds,
    };
  }

  for (const application of candidates.slice(capacity)) {
    reserveIds.add(application.id);
  }

  const positionPool = candidates.filter((application) => !reserveIds.has(application.id));

  for (const position of POSITIONS) {
    const samePosition = positionPool
      .filter((application) => application.mainPosition === position)
      .sort((a, b) => {
        const createdAtDiff = a.createdAt.getTime() - b.createdAt.getTime();
        if (createdAtDiff !== 0) return createdAtDiff;
        return a.id - b.id;
      });

    if (samePosition.length <= teamCount) continue;

    for (const application of samePosition.slice(teamCount)) {
      reserveIds.add(application.id);
    }
  }

  return {
    teamCount,
    capacity,
    reserveIds,
  };
}

export async function applyDestructionRecruitmentAutoReserve(tournamentId: number) {
  if (!Number.isFinite(tournamentId)) {
    return {
      skipped: true,
      reason: "INVALID_TOURNAMENT_ID",
      changedCount: 0,
      teamCount: 0,
      capacity: 0,
      reserveCount: 0,
    };
  }

  const tournament = await prisma.destructionTournament.findUnique({
    where: {
      id: tournamentId,
    },
    select: {
      id: true,
      status: true,
      _count: {
        select: {
          teams: true,
          matches: true,
        },
      },
    },
  });

  if (!tournament) {
    return {
      skipped: true,
      reason: "TOURNAMENT_NOT_FOUND",
      changedCount: 0,
      teamCount: 0,
      capacity: 0,
      reserveCount: 0,
    };
  }

  if (tournament.status !== "RECRUITING" || tournament._count.teams > 0 || tournament._count.matches > 0) {
    return {
      skipped: true,
      reason: "NOT_RECRUITING_OR_ALREADY_STARTED",
      changedCount: 0,
      teamCount: 0,
      capacity: 0,
      reserveCount: 0,
    };
  }

  const applications = await prisma.destructionParticipationApply.findMany({
    where: {
      tournamentId,
      status: {
        in: ["APPLIED", "CONFIRMED", "RESERVE"],
      },
    },
    select: {
      id: true,
      status: true,
      mainPosition: true,
      createdAt: true,
    },
    orderBy: [
      { createdAt: "asc" },
      { id: "asc" },
    ],
  });

  const { teamCount, capacity, reserveIds } = calculateReserveIds(applications);
  const toReserveIds: number[] = [];
  const toActiveIds: number[] = [];

  for (const application of applications) {
    const shouldReserve = reserveIds.has(application.id);

    if (shouldReserve && application.status !== "RESERVE") {
      toReserveIds.push(application.id);
    }

    if (!shouldReserve && application.status === "RESERVE") {
      toActiveIds.push(application.id);
    }
  }

  const writes: Promise<unknown>[] = [];

  if (toReserveIds.length > 0) {
    writes.push(
      prisma.destructionParticipationApply.updateMany({
        where: {
          id: {
            in: toReserveIds,
          },
        },
        data: {
          status: "RESERVE",
        },
      }),
    );
  }

  if (toActiveIds.length > 0) {
    writes.push(
      prisma.destructionParticipationApply.updateMany({
        where: {
          id: {
            in: toActiveIds,
          },
        },
        data: {
          status: "APPLIED",
        },
      }),
    );
  }

  if (writes.length > 0) {
    await Promise.all(writes);
  }

  return {
    skipped: false,
    changedCount: toReserveIds.length + toActiveIds.length,
    teamCount,
    capacity,
    reserveCount: reserveIds.size,
  };
}
