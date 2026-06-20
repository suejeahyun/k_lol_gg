import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";

const APP_HOME_SUMMARY_KEY = "app:home-summary:v13";
const APP_HOME_SUMMARY_TTL_MS = 60 * 1000;

export type AppHomeSummary = {
  activeRecruitCount: number;
  matchCount: number;
  playerCount: number;
  updatedAt: string;
};

function isAppHomeSummary(value: unknown): value is AppHomeSummary {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<AppHomeSummary>;
  return (
    typeof data.activeRecruitCount === "number" &&
    typeof data.matchCount === "number" &&
    typeof data.playerCount === "number" &&
    typeof data.updatedAt === "string"
  );
}

export async function refreshAppHomeSummary(): Promise<AppHomeSummary> {
  const [activeRecruitCount, matchCount, playerCount] = await Promise.all([
    prisma.recruitParty.count({ where: { status: "IN_PROGRESS" } }).catch(() => 0),
    prisma.matchSeries.count().catch(() => 0),
    prisma.player.count({ where: { isActive: true } }).catch(() => 0),
  ]);

  const summary = {
    activeRecruitCount,
    matchCount,
    playerCount,
    updatedAt: new Date().toISOString(),
  };

  await prisma.appDataCache.upsert({
    where: { key: APP_HOME_SUMMARY_KEY },
    update: { value: summary as Prisma.InputJsonValue, version: 13 },
    create: { key: APP_HOME_SUMMARY_KEY, value: summary as Prisma.InputJsonValue, version: 13 },
  });

  return summary;
}

export async function getAppHomeSummary(): Promise<AppHomeSummary> {
  const cached = await prisma.appDataCache.findUnique({
    where: { key: APP_HOME_SUMMARY_KEY },
    select: { value: true, updatedAt: true },
  });

  if (
    cached &&
    Date.now() - cached.updatedAt.getTime() < APP_HOME_SUMMARY_TTL_MS &&
    isAppHomeSummary(cached.value)
  ) {
    return cached.value;
  }

  return refreshAppHomeSummary();
}
