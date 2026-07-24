import type { Prisma } from "@prisma/client";

const PARTY_LOCK_NAMESPACE = 1;
const SEASON_LOCK_NAMESPACE = 2;
const SCRIM_LOCK_NAMESPACE = 3;

async function acquireLock(
  tx: Prisma.TransactionClient,
  namespace: number,
  resourceId: number,
) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(${namespace}, ${resourceId})`;
}

export function acquirePartyRecruitLock(
  tx: Prisma.TransactionClient,
  partyId: number,
) {
  return acquireLock(tx, PARTY_LOCK_NAMESPACE, partyId);
}

export function acquireSeasonRecruitLock(
  tx: Prisma.TransactionClient,
  applyDate: Date,
  recruitNo: number,
) {
  const dateKey = Math.floor(applyDate.getTime() / 86_400_000);
  return acquireLock(tx, SEASON_LOCK_NAMESPACE, dateKey * 1_000 + recruitNo);
}

export function acquireScrimRecruitLock(
  tx: Prisma.TransactionClient,
  scrimId: number,
) {
  return acquireLock(tx, SCRIM_LOCK_NAMESPACE, scrimId);
}
