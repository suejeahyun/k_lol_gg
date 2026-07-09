export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { requireAdminRequest } from "@/lib/auth/requireAdmin";

const VALID_TYPES = new Set(["CAUTION", "WARNING", "BAN"]);
const VALID_SOURCES = new Set(["MANUAL", "LATE", "NO_SHOW", "CHAT_ABUSE", "TOXICITY", "LINE_FORM", "KICK", "BAN", "OTHER"]);

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

function normalizeSearch(value: string | null) {
  return String(value || "").trim();
}

export async function GET(req: NextRequest) {
  const admin = await requireAdminRequest();
  if (!admin) return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 401 });

  const url = new URL(req.url);
  const search = normalizeSearch(url.searchParams.get("q"));
  const activeParam = url.searchParams.get("active");
  const where: Prisma.UserDisciplineRecordWhereInput = {};
  if (activeParam === "true") where.isActive = true;
  if (activeParam === "false") where.isActive = false;
  if (search) {
    where.OR = [
      { targetName: { contains: search, mode: "insensitive" } },
      { targetNickname: { contains: search, mode: "insensitive" } },
      { targetTag: { contains: search, mode: "insensitive" } },
      { reason: { contains: search, mode: "insensitive" } },
      { note: { contains: search, mode: "insensitive" } },
      { userAccount: { userId: { contains: search, mode: "insensitive" } } },
      { player: { name: { contains: search, mode: "insensitive" } } },
      { player: { nickname: { contains: search, mode: "insensitive" } } },
      { player: { tag: { contains: search, mode: "insensitive" } } },
    ];
  }

  const [records, activeWarnings, activeCautions, activeBans] = await Promise.all([
    prisma.userDisciplineRecord.findMany({
      where,
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
      take: 200,
      include: {
        userAccount: { select: { id: true, userId: true, role: true, status: true } },
        player: { select: { id: true, name: true, nickname: true, tag: true } },
      },
    }),
    prisma.userDisciplineRecord.count({ where: { isActive: true, type: "WARNING" } }),
    prisma.userDisciplineRecord.count({ where: { isActive: true, type: "CAUTION" } }),
    prisma.userDisciplineRecord.count({ where: { isActive: true, type: "BAN" } }),
  ]);

  return NextResponse.json({
    ok: true,
    summary: { activeWarnings, activeCautions, activeBans },
    records,
  });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdminRequest();
  if (!admin) return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const userAccountId = body.userAccountId ? Number(body.userAccountId) : null;
  const playerId = body.playerId ? Number(body.playerId) : null;
  const type = normalizeType(body.type);
  const source = normalizeSource(body.source);
  const reason = String(body.reason || "").trim();
  const note = cleanText(body.note);

  if (!reason) return NextResponse.json({ message: "사유가 필요합니다." }, { status: 400 });

  const user = userAccountId ? await prisma.userAccount.findUnique({
    where: { id: userAccountId },
    include: { player: true },
  }) : null;
  const player = playerId ? await prisma.player.findUnique({ where: { id: playerId }, include: { userAccount: true } }) : null;
  const targetPlayer = player || user?.player || null;

  const directName = cleanText(body.targetName);
  const directNickname = cleanText(body.targetNickname);
  const directTag = cleanText(body.targetTag);

  if (!user && !targetPlayer && !directName) {
    return NextResponse.json({ message: "등록되지 않은 대상은 이름을 직접 입력해야 합니다." }, { status: 400 });
  }

  const created = await prisma.userDisciplineRecord.create({
    data: {
      userAccountId: user?.id || targetPlayer?.userAccountId || null,
      playerId: targetPlayer?.id || null,
      targetName: directName || targetPlayer?.name || user?.userId || "대상 미상",
      targetNickname: directNickname || targetPlayer?.nickname || null,
      targetTag: directTag || targetPlayer?.tag || null,
      type,
      source,
      reason,
      note,
      createdBy: admin.user.userId,
    },
  });

  return NextResponse.json({ ok: true, record: created });
}
