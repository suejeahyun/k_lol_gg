import { prisma } from "@/lib/prisma/client";

type AdminLogClient = {
  adminLog: {
    create: (args: {
      data: {
        action: string;
        message: string;
      };
    }) => unknown;
  };
};

type WriteAdminLogParams = {
  action: string;
  message: string;
  db?: AdminLogClient;
};

function normalizeLogText(value: string, fallback: string, maxLength: number) {
  const normalized = String(value || fallback).replace(/\s+/g, " ").trim();
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1)}…`
    : normalized;
}

export async function writeAdminLog({
  action,
  message,
  db = prisma,
}: WriteAdminLogParams) {
  const safeAction = normalizeLogText(action, "ADMIN_ACTION", 80);
  const safeMessage = normalizeLogText(message, "운영 로그", 900);

  try {
    await db.adminLog.create({
      data: {
        action: safeAction,
        message: safeMessage,
      },
    });
  } catch (error) {
    console.error("[ADMIN_LOG_WRITE_ERROR]", error);
  }
}
