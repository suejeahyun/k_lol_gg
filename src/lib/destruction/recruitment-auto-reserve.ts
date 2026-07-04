import { prisma } from "@/lib/prisma/client";

const POSITIONS = ["TOP", "JGL", "MID", "ADC", "SUP"] as const;
const AUTO_MANAGED_STATUSES = ["APPLIED", "RESERVE"] as const;
const RECRUITMENT_POOL_STATUSES = ["APPLIED", "CONFIRMED", "RESERVE"] as const;

const DEFAULT_LANE_LIMIT = 10;
const MIN_LANE_LIMIT = 1;
const MAX_LANE_LIMIT = 99;

type AutoManagedStatus = (typeof AUTO_MANAGED_STATUSES)[number];
type RecruitmentPoolStatus = (typeof RECRUITMENT_POOL_STATUSES)[number];
type PositionValue = (typeof POSITIONS)[number];

export type DestructionLaneLimits = Record<PositionValue, number>;

type ApplicationForAutoReserve = {
  id: number;
  status: RecruitmentPoolStatus | string;
  mainPosition: string;
  createdAt: Date;
};

type ApplicationForCapacityOverflow = {
  id: number;
  status: RecruitmentPoolStatus | string;
  createdAt: Date;
};

type ApplicationForPublicClassification = {
  id: number;
  status: RecruitmentPoolStatus | string;
  mainPosition: string;
  createdAt: Date;
};

type TournamentLaneLimitSource = {
  topLaneLimit?: number | null;
  jungleLaneLimit?: number | null;
  midLaneLimit?: number | null;
  adcLaneLimit?: number | null;
  supportLaneLimit?: number | null;
};

export const DEFAULT_DESTRUCTION_LANE_LIMITS: DestructionLaneLimits = {
  TOP: DEFAULT_LANE_LIMIT,
  JGL: DEFAULT_LANE_LIMIT,
  MID: DEFAULT_LANE_LIMIT,
  ADC: DEFAULT_LANE_LIMIT,
  SUP: DEFAULT_LANE_LIMIT,
};

export function normalizeDestructionLaneLimit(value: unknown, fallback = DEFAULT_LANE_LIMIT) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  if (parsed < MIN_LANE_LIMIT) return MIN_LANE_LIMIT;
  if (parsed > MAX_LANE_LIMIT) return MAX_LANE_LIMIT;
  return parsed;
}

export function getDestructionLaneLimits(source?: TournamentLaneLimitSource | null): DestructionLaneLimits {
  return {
    TOP: normalizeDestructionLaneLimit(source?.topLaneLimit, DEFAULT_LANE_LIMIT),
    JGL: normalizeDestructionLaneLimit(source?.jungleLaneLimit, DEFAULT_LANE_LIMIT),
    MID: normalizeDestructionLaneLimit(source?.midLaneLimit, DEFAULT_LANE_LIMIT),
    ADC: normalizeDestructionLaneLimit(source?.adcLaneLimit, DEFAULT_LANE_LIMIT),
    SUP: normalizeDestructionLaneLimit(source?.supportLaneLimit, DEFAULT_LANE_LIMIT),
  };
}

export function parseDestructionLaneLimits(body: Record<string, unknown>, fallback?: TournamentLaneLimitSource | null) {
  const source = body.laneLimits && typeof body.laneLimits === "object"
    ? (body.laneLimits as Record<string, unknown>)
    : body;
  const fallbackLimits = getDestructionLaneLimits(fallback);

  return {
    topLaneLimit: normalizeDestructionLaneLimit(source.topLaneLimit ?? source.TOP, fallbackLimits.TOP),
    jungleLaneLimit: normalizeDestructionLaneLimit(source.jungleLaneLimit ?? source.JGL, fallbackLimits.JGL),
    midLaneLimit: normalizeDestructionLaneLimit(source.midLaneLimit ?? source.MID, fallbackLimits.MID),
    adcLaneLimit: normalizeDestructionLaneLimit(source.adcLaneLimit ?? source.ADC, fallbackLimits.ADC),
    supportLaneLimit: normalizeDestructionLaneLimit(source.supportLaneLimit ?? source.SUP, fallbackLimits.SUP),
  };
}

export function isBeforeDestructionAuction(status: string) {
  return status === "PLANNED" || status === "RECRUITING" || status === "TEAM_BUILDING";
}

function isAutoManagedStatus(status: string): status is AutoManagedStatus {
  return (AUTO_MANAGED_STATUSES as readonly string[]).includes(status);
}

function isRecruitmentPoolStatus(status: string): status is RecruitmentPoolStatus {
  return (RECRUITMENT_POOL_STATUSES as readonly string[]).includes(status);
}

function sortByApplyOrder<T extends { id: number; createdAt: Date }>(items: T[]) {
  return items.slice().sort((a, b) => {
    const createdAtDiff = a.createdAt.getTime() - b.createdAt.getTime();
    if (createdAtDiff !== 0) return createdAtDiff;
    return a.id - b.id;
  });
}

function countConfirmedByPosition(applications: ApplicationForAutoReserve[]) {
  const counts = Object.fromEntries(POSITIONS.map((position) => [position, 0])) as Record<PositionValue, number>;

  for (const application of applications) {
    if (application.status !== "CONFIRMED") continue;
    if (!POSITIONS.includes(application.mainPosition as PositionValue)) continue;
    counts[application.mainPosition as PositionValue] += 1;
  }

  return counts;
}

export function calculateDestructionReserveIds(
  applications: ApplicationForAutoReserve[],
  laneLimits: DestructionLaneLimits = DEFAULT_DESTRUCTION_LANE_LIMITS,
) {
  const pool = sortByApplyOrder(
    applications.filter((application) => isRecruitmentPoolStatus(String(application.status))),
  );
  const confirmedApplications = pool.filter((application) => application.status === "CONFIRMED");
  const candidates = pool.filter((application) => isAutoManagedStatus(String(application.status)));

  const teamCount = pool.length >= 5 ? Math.floor(pool.length / 5) : 0;
  const capacity = teamCount * 5;
  const reserveIds = new Set<number>();

  if (teamCount === 0) {
    return {
      teamCount,
      capacity,
      reserveIds,
    };
  }

  const availableCapacity = Math.max(0, capacity - confirmedApplications.length);

  for (const application of candidates.slice(availableCapacity)) {
    reserveIds.add(application.id);
  }

  const positionPool = candidates.filter((application) => !reserveIds.has(application.id));
  const confirmedByPosition = countConfirmedByPosition(pool);

  for (const position of POSITIONS) {
    const samePosition = positionPool
      .filter((application) => application.mainPosition === position)
      .sort((a, b) => {
        const createdAtDiff = a.createdAt.getTime() - b.createdAt.getTime();
        if (createdAtDiff !== 0) return createdAtDiff;
        return a.id - b.id;
      });

    const positionLimit = Math.max(0, laneLimits[position] - confirmedByPosition[position]);
    if (samePosition.length <= positionLimit) continue;

    for (const application of samePosition.slice(positionLimit)) {
      reserveIds.add(application.id);
    }
  }

  return {
    teamCount,
    capacity,
    reserveIds,
  };
}

export function getDestructionTotalCapacity(laneLimits: DestructionLaneLimits = DEFAULT_DESTRUCTION_LANE_LIMITS) {
  return POSITIONS.reduce((sum, position) => sum + laneLimits[position], 0);
}

export function calculateDestructionCapacityOverflowIds(
  applications: ApplicationForCapacityOverflow[],
  laneLimits: DestructionLaneLimits = DEFAULT_DESTRUCTION_LANE_LIMITS,
) {
  const pool = sortByApplyOrder(
    applications.filter((application) => isRecruitmentPoolStatus(String(application.status))),
  );
  const confirmedApplications = pool.filter((application) => application.status === "CONFIRMED");
  const candidates = pool.filter((application) => isAutoManagedStatus(String(application.status)));

  const capacity = getDestructionTotalCapacity(laneLimits);
  const teamCount = Math.floor(Math.min(pool.length, capacity) / 5);
  const overflowIds = new Set<number>();
  const availableCapacity = Math.max(0, capacity - confirmedApplications.length);

  if (capacity <= 0 || candidates.length <= availableCapacity) {
    return {
      teamCount,
      capacity,
      overflowIds,
    };
  }

  for (const application of candidates.slice(availableCapacity)) {
    overflowIds.add(application.id);
  }

  return {
    teamCount,
    capacity,
    overflowIds,
  };
}

export function calculateDestructionPublicApplicationIds(
  applications: ApplicationForPublicClassification[],
  laneLimits: DestructionLaneLimits = DEFAULT_DESTRUCTION_LANE_LIMITS,
) {
  const pool = sortByApplyOrder(
    applications.filter((application) => isRecruitmentPoolStatus(String(application.status))),
  );
  const confirmedApplications = pool.filter((application) => application.status === "CONFIRMED");
  const candidates = pool.filter((application) => isAutoManagedStatus(String(application.status)));

  const capacity = getDestructionTotalCapacity(laneLimits);
  const teamCount = Math.floor(Math.min(pool.length, capacity) / 5);
  const capacityOverflowIds = new Set<number>();
  const laneOverflowIds = new Set<number>();
  const availableCapacity = Math.max(0, capacity - confirmedApplications.length);

  if (capacity > 0 && candidates.length > availableCapacity) {
    for (const application of candidates.slice(availableCapacity)) {
      capacityOverflowIds.add(application.id);
    }
  }

  const publicParticipantPool = candidates.filter((application) => !capacityOverflowIds.has(application.id));
  const confirmedByPosition = countConfirmedByPosition(pool);

  for (const position of POSITIONS) {
    const samePosition = publicParticipantPool
      .filter((application) => application.mainPosition === position)
      .sort((a, b) => {
        const createdAtDiff = a.createdAt.getTime() - b.createdAt.getTime();
        if (createdAtDiff !== 0) return createdAtDiff;
        return a.id - b.id;
      });

    const positionLimit = Math.max(0, laneLimits[position] - confirmedByPosition[position]);
    if (samePosition.length <= positionLimit) continue;

    for (const application of samePosition.slice(positionLimit)) {
      laneOverflowIds.add(application.id);
    }
  }

  return {
    teamCount,
    capacity,
    capacityOverflowIds,
    laneOverflowIds,
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
      topLaneLimit: true,
      jungleLaneLimit: true,
      midLaneLimit: true,
      adcLaneLimit: true,
      supportLaneLimit: true,
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

  if (!isBeforeDestructionAuction(tournament.status) || tournament._count.teams > 0 || tournament._count.matches > 0) {
    return {
      skipped: true,
      reason: "NOT_BEFORE_AUCTION_OR_ALREADY_STARTED",
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

  const laneLimits = getDestructionLaneLimits(tournament);
  const { teamCount, capacity, reserveIds } = calculateDestructionReserveIds(applications, laneLimits);
  const toReserveIds: number[] = [];
  const toActiveIds: number[] = [];

  for (const application of applications) {
    if (application.status === "CONFIRMED") continue;

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
