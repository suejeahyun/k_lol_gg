export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { cleanupOldAdminLogs, writeAdminLog } from "@/lib/admin-log";
import { cleanupOldRateLimitLogs } from "@/lib/rate-limit";
import {
  isCronConfigured,
  isCronRequestAuthorized,
} from "@/lib/security/cron-auth";
import { logServerError } from "@/lib/server/safe-log";

const DEFAULT_ADMIN_LOG_RETENTION_DAYS = 365;
const DEFAULT_RATE_LIMIT_RETENTION_DAYS = 7;

function boundedDays(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max
    ? parsed
    : fallback;
}

export async function GET(request: Request) {
  if (!isCronConfigured()) {
    return NextResponse.json(
      { ok: false, message: "Cron 인증이 설정되지 않았습니다." },
      { status: 503 },
    );
  }

  if (!isCronRequestAuthorized(request)) {
    return NextResponse.json(
      { ok: false, message: "Cron 인증 정보가 올바르지 않습니다." },
      { status: 401 },
    );
  }

  const adminLogDays = boundedDays(
    process.env.ADMIN_LOG_RETENTION_DAYS,
    DEFAULT_ADMIN_LOG_RETENTION_DAYS,
    30,
    3650,
  );
  const rateLimitDays = boundedDays(
    process.env.RATE_LIMIT_LOG_RETENTION_DAYS,
    DEFAULT_RATE_LIMIT_RETENTION_DAYS,
    1,
    90,
  );

  try {
    const [adminLogs, rateLimitLogs] = await Promise.all([
      cleanupOldAdminLogs(adminLogDays),
      cleanupOldRateLimitLogs(rateLimitDays),
    ]);

    await writeAdminLog({
      action: "SCHEDULED_RETENTION_CLEANUP",
      message: "예약된 운영 로그 보존 정리가 완료되었습니다.",
      actorType: "SYSTEM",
      afterJson: {
        adminLogRetentionDays: adminLogDays,
        adminLogsDeleted: adminLogs.count,
        rateLimitRetentionDays: rateLimitDays,
        rateLimitLogsDeleted: rateLimitLogs.count,
      },
    });

    return NextResponse.json({
      ok: true,
      adminLogs: { retentionDays: adminLogDays, deleted: adminLogs.count },
      rateLimitLogs: {
        retentionDays: rateLimitDays,
        deleted: rateLimitLogs.count,
      },
    });
  } catch (error) {
    logServerError("[SCHEDULED_RETENTION_CLEANUP_ERROR]", error);
    return NextResponse.json(
      { ok: false, message: "운영 로그 보존 정리에 실패했습니다." },
      { status: 500 },
    );
  }
}
