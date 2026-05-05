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

export async function writeAdminLog({
  action,
  message,
  db = prisma,
}: WriteAdminLogParams) {
  const safeAction = String(action || "ADMIN_ACTION").trim();
  const safeMessage = String(message || "운영 로그").trim();

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
