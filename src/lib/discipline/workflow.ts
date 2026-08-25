import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { makePublicCode } from "@/lib/kakao/managed-forms";

type Db = Prisma.TransactionClient | PrismaClient;

export type DisciplineTarget = {
  userAccountId?: number | null;
  playerId?: number | null;
  targetName: string;
  targetNickname?: string | null;
  targetTag?: string | null;
};

function dueIn30Days(issuedAt: Date) {
  return new Date(issuedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
}

export function disciplineIdentityKey(target: DisciplineTarget) {
  if (target.userAccountId) return `user:${target.userAccountId}`;
  if (target.playerId) return `player:${target.playerId}`;
  return `direct:${target.targetName.trim().toLowerCase()}|${(target.targetNickname ?? "").trim().toLowerCase()}|${(target.targetTag ?? "").trim().toLowerCase()}`;
}

function targetWhere(target: DisciplineTarget): Prisma.UserDisciplineRecordWhereInput {
  if (target.userAccountId) return { userAccountId: target.userAccountId };
  if (target.playerId) return { playerId: target.playerId };
  return {
    targetName: { equals: target.targetName, mode: "insensitive" },
    targetNickname: target.targetNickname ? { equals: target.targetNickname, mode: "insensitive" } : null,
    targetTag: target.targetTag ? { equals: target.targetTag, mode: "insensitive" } : null,
  };
}

async function createResolutionTask(db: Db, recordId: number, category: "GENERAL" | "INHOUSE", issuedAt: Date) {
  return db.disciplineResolutionTask.create({
    data: {
      disciplineRecordId: recordId,
      category,
      requiredGameCount: category === "INHOUSE" ? 15 : 10,
      issuedAt,
      dueAt: dueIn30Days(issuedAt),
      publicCode: makePublicCode("WR"),
    },
  });
}

async function ensureBanReview(db: Db, target: DisciplineTarget) {
  const warnings = await db.userDisciplineRecord.findMany({
    where: { ...targetWhere(target), type: "WARNING", isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
    take: 50,
  });
  if (warnings.length < 3) return null;
  const identity = disciplineIdentityKey(target);
  const existing = await db.disciplineBanReview.findFirst({ where: { targetIdentityKey: identity, status: "PENDING" } });
  if (existing) return existing;
  return db.disciplineBanReview.create({
    data: {
      targetIdentityKey: identity,
      targetName: target.targetName,
      targetNickname: target.targetNickname ?? null,
      targetTag: target.targetTag ?? null,
      warningRecordIds: warnings.map((item) => item.id),
    },
  });
}

export async function createWarning(params: {
  target: DisciplineTarget;
  reason: string;
  category: "GENERAL" | "INHOUSE";
  issuedAt: Date;
  source: string;
  sourceRefKey?: string | null;
  sourceRefType?: string | null;
  sourceRefId?: string | null;
  sourceMeta?: Prisma.InputJsonValue;
  note?: string | null;
  createdBy: string;
}) {
  return prisma.$transaction(async (tx) => {
    const record = await tx.userDisciplineRecord.create({
      data: {
        userAccountId: params.target.userAccountId ?? null,
        playerId: params.target.playerId ?? null,
        targetName: params.target.targetName,
        targetNickname: params.target.targetNickname ?? null,
        targetTag: params.target.targetTag ?? null,
        type: "WARNING",
        reason: params.reason.trim(),
        source: params.source,
        sourceRefKey: params.sourceRefKey ?? null,
        sourceRefType: params.sourceRefType ?? null,
        sourceRefId: params.sourceRefId ?? null,
        sourceMeta: params.sourceMeta,
        note: params.note ?? null,
        createdBy: params.createdBy,
        createdAt: params.issuedAt,
      },
    });
    const task = await createResolutionTask(tx, record.id, params.category, params.issuedAt);
    const banReview = await ensureBanReview(tx, params.target);
    return { record, task, banReview };
  });
}

export async function convertActiveCautions(target: DisciplineTarget, createdBy: string) {
  return prisma.$transaction(async (tx) => {
    const cautions = await tx.userDisciplineRecord.findMany({
      where: {
        ...targetWhere(target),
        type: "CAUTION",
        isActive: true,
        cautionConversions: { none: {} },
      },
      orderBy: { createdAt: "asc" },
      take: 3,
    });
    if (cautions.length < 3) return null;
    const issuedAt = new Date();
    const warning = await tx.userDisciplineRecord.create({
      data: {
        userAccountId: target.userAccountId ?? null,
        playerId: target.playerId ?? null,
        targetName: target.targetName,
        targetNickname: target.targetNickname ?? null,
        targetTag: target.targetTag ?? null,
        type: "WARNING",
        reason: "주의 3회 누적에 따른 자동 경고 전환",
        source: "CAUTION_CONVERSION",
        sourceRefKey: `caution-conversion:${cautions.map((item) => item.id).join("-")}`,
        sourceMeta: { cautionRecordIds: cautions.map((item) => item.id) },
        createdBy,
      },
    });
    await tx.disciplineCautionConversion.createMany({
      data: cautions.map((item) => ({ cautionRecordId: item.id, warningRecordId: warning.id })),
    });
    await tx.userDisciplineRecord.updateMany({
      where: { id: { in: cautions.map((item) => item.id) } },
      data: { isActive: false, resetAt: issuedAt, resetReason: "주의 3회 누적 경고 전환", resetBy: createdBy },
    });
    await createResolutionTask(tx, warning.id, "GENERAL", issuedAt);
    await ensureBanReview(tx, target);
    return warning;
  });
}
