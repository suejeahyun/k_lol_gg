export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { rejectIfInvalidDiscordBotSecret } from "@/lib/discord/secret";

type Body = {
  secret?: string;
  recordId?: number;
  recordIds?: number[];
  discordDmStatus?: string;
  discordDmSentAt?: string | null;
  discordDmError?: string | null;
  discordAdminNotifiedAt?: string | null;
};

function cleanStatus(value: unknown) {
  const status = String(value || "").trim().toUpperCase();
  if (["PENDING", "SENT", "FAILED", "SKIPPED", "DISABLED"].includes(status)) return status;
  return null;
}

function parseDate(value: unknown) {
  if (!value) return new Date();
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Body;
  const rejected = rejectIfInvalidDiscordBotSecret(req, body.secret);
  if (rejected) return rejected;

  const recordIds = Array.isArray(body.recordIds)
    ? body.recordIds.map(Number).filter((id) => Number.isInteger(id) && id > 0)
    : body.recordId ? [Number(body.recordId)].filter((id) => Number.isInteger(id) && id > 0) : [];

  if (recordIds.length === 0) {
    return NextResponse.json({ message: "recordId 또는 recordIds가 필요합니다." }, { status: 400 });
  }

  const data: Prisma.UserDisciplineRecordUpdateManyMutationInput = {};
  if (body.discordAdminNotifiedAt !== undefined) data.discordAdminNotifiedAt = parseDate(body.discordAdminNotifiedAt);

  const dmStatus = cleanStatus(body.discordDmStatus);
  if (dmStatus) {
    data.discordDmStatus = dmStatus;
    if (dmStatus === "SENT") data.discordDmSentAt = parseDate(body.discordDmSentAt);
    if (dmStatus === "FAILED") data.discordDmError = String(body.discordDmError || "DM 발송 실패").slice(0, 2000);
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ message: "업데이트할 알림 결과가 없습니다." }, { status: 400 });
  }

  const result = await prisma.userDisciplineRecord.updateMany({
    where: { id: { in: recordIds }, sourceRefType: "RECRUIT_LATE" },
    data,
  });

  return NextResponse.json({ ok: true, updatedCount: result.count, recordIds });
}
