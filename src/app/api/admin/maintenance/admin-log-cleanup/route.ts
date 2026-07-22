export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import {
  cleanupOldAdminLogs,
  getRequestAuditFields,
  writeAdminLog,
} from "@/lib/admin-log";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";

const DEFAULT_RETENTION_DAYS = 365;
const MIN_RETENTION_DAYS = 30;
const MAX_RETENTION_DAYS = 3650;

function getDefaultRetentionDays() {
  const value = Number(process.env.ADMIN_LOG_RETENTION_DAYS);
  return Number.isInteger(value) && value >= MIN_RETENTION_DAYS && value <= MAX_RETENTION_DAYS
    ? value
    : DEFAULT_RETENTION_DAYS;
}

export async function POST(req: NextRequest) {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  const body = await req.json().catch(() => ({}));
  const requestedDays = Number(body.days ?? getDefaultRetentionDays());

  if (
    !Number.isInteger(requestedDays) ||
    requestedDays < MIN_RETENTION_DAYS ||
    requestedDays > MAX_RETENTION_DAYS
  ) {
    return NextResponse.json(
      { message: `보존 기간은 ${MIN_RETENTION_DAYS}~${MAX_RETENTION_DAYS}일 사이의 정수여야 합니다.` },
      { status: 400 },
    );
  }

  const result = await cleanupOldAdminLogs(requestedDays);

  await writeAdminLog({
    action: "ADMIN_LOG_RETENTION_CLEANUP",
    message: `관리자 감사 로그 보존 정리: ${requestedDays}일 이전 ${result.count}건 삭제`,
    afterJson: {
      retentionDays: requestedDays,
      deletedCount: result.count,
    },
    ...getRequestAuditFields(req),
  });

  return NextResponse.json({
    message: `${requestedDays}일 이전 관리자 감사 로그 정리가 완료되었습니다.`,
    deletedCount: result.count,
    retentionDays: requestedDays,
  });
}
