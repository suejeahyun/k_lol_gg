export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { requireAdminRequest } from "@/lib/auth/requireAdmin";

const VALID_TYPES = new Set(["CAUTION", "WARNING"]);
const VALID_SOURCES = new Set(["MANUAL", "LATE", "NO_SHOW", "CHAT_ABUSE", "TOXICITY", "LINE_FORM", "OTHER"]);

function normalizeType(value: unknown) {
  const type = String(value || "CAUTION").toUpperCase();
  return VALID_TYPES.has(type) ? type : "CAUTION";
}

function normalizeSource(value: unknown) {
  const source = String(value || "MANUAL").toUpperCase();
  return VALID_SOURCES.has(source) ? source : "MANUAL";
}

function cleanText(value: unknown) {
  const text = String(value || "").trim();
  if (!text || text === "-" || text === "미입력") return null;
  return text;
}

async function parseId(params: Promise<{ id: string }>) {
  const { id } = await params;
  const recordId = Number(id);
  if (!Number.isInteger(recordId) || recordId <= 0) return null;
  return recordId;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminRequest();
  if (!admin) return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 401 });

  const recordId = await parseId(params);
  if (!recordId) return NextResponse.json({ message: "잘못된 기록 ID입니다." }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const reason = String(body.reason || "").trim();
  if (!reason) return NextResponse.json({ message: "사유가 필요합니다." }, { status: 400 });

  const nextActive = Boolean(body.isActive);
  const current = await prisma.userDisciplineRecord.findUnique({ where: { id: recordId } });
  if (!current) return NextResponse.json({ message: "기록을 찾을 수 없습니다." }, { status: 404 });

  const updated = await prisma.userDisciplineRecord.update({
    where: { id: recordId },
    data: {
      type: normalizeType(body.type),
      source: normalizeSource(body.source),
      reason,
      note: cleanText(body.note),
      isActive: nextActive,
      resetAt: nextActive ? null : current.resetAt || new Date(),
      resetReason: nextActive ? null : current.resetReason || "운영자 상세 수정으로 비활성 처리",
      resetBy: nextActive ? null : current.resetBy || admin.user.userId,
    },
  });

  return NextResponse.json({ ok: true, record: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminRequest();
  if (!admin) return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 401 });

  const recordId = await parseId(params);
  if (!recordId) return NextResponse.json({ message: "잘못된 기록 ID입니다." }, { status: 400 });

  const updated = await prisma.userDisciplineRecord.update({
    where: { id: recordId },
    data: {
      isActive: false,
      resetAt: new Date(),
      resetReason: "운영자 삭제 처리",
      resetBy: admin.user.userId,
    },
  });

  return NextResponse.json({ ok: true, record: updated });
}
