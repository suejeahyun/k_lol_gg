import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";

type AdminLogClient = {
  adminLog: {
    create: (args: {
      data: Prisma.AdminLogUncheckedCreateInput;
    }) => unknown;
  };
};

type WriteAdminLogParams = {
  action: string;
  message: string;
  actorId?: number | null;
  actorType?: string | null;
  actorUserId?: string | null;
  targetType?: string | null;
  targetId?: number | null;
  beforeJson?: Prisma.InputJsonValue | null;
  afterJson?: Prisma.InputJsonValue | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  db?: AdminLogClient;
};

function normalizeLogText(value: string | null | undefined, fallback: string, maxLength: number) {
  const normalized = String(value || fallback).replace(/\s+/g, " ").trim();
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1)}…`
    : normalized;
}

function normalizeNullableText(value: string | null | undefined, maxLength: number) {
  if (!value) return null;
  const normalized = String(value).replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1)}…`
    : normalized;
}

const SENSITIVE_LOG_KEY =
  /(password|passphrase|secret|token|authorization|cookie|totp|otp.?auth|api.?key)/i;

function redactSensitiveJson(value: Prisma.InputJsonValue, depth = 0): Prisma.InputJsonValue {
  if (depth >= 8) return "[TRUNCATED]";

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveJson(item, depth + 1));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        SENSITIVE_LOG_KEY.test(key)
          ? "[REDACTED]"
          : redactSensitiveJson(item as Prisma.InputJsonValue, depth + 1),
      ]),
    );
  }

  return value;
}

export async function writeAdminLog({
  action,
  message,
  actorId = null,
  actorType = null,
  actorUserId = null,
  targetType = null,
  targetId = null,
  beforeJson = null,
  afterJson = null,
  ipAddress = null,
  userAgent = null,
  db = prisma,
}: WriteAdminLogParams) {
  const safeAction = normalizeLogText(action, "ADMIN_ACTION", 80);
  const safeMessage = normalizeLogText(message, "운영 로그", 900);

  try {
    await db.adminLog.create({
      data: {
        action: safeAction,
        message: safeMessage,
        actorId: actorId ?? null,
        actorType: normalizeNullableText(actorType, 80),
        actorUserId: normalizeNullableText(actorUserId, 120),
        targetType: normalizeNullableText(targetType, 80),
        targetId: targetId ?? null,
        beforeJson: beforeJson === null ? undefined : redactSensitiveJson(beforeJson),
        afterJson: afterJson === null ? undefined : redactSensitiveJson(afterJson),
        ipAddress: normalizeNullableText(ipAddress, 80),
        userAgent: normalizeNullableText(userAgent, 240),
      },
    });
  } catch (error) {
    console.error("[ADMIN_LOG_WRITE_ERROR]", error);
  }
}

export function getRequestAuditFields(req: Request) {
  const forwardedFor = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = req.headers.get("x-real-ip")?.trim();

  return {
    ipAddress: forwardedFor || realIp || null,
    userAgent: req.headers.get("user-agent") || null,
  };
}

export async function cleanupOldAdminLogs(days: number) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  return prisma.adminLog.deleteMany({
    where: {
      createdAt: { lt: cutoff },
    },
  });
}
