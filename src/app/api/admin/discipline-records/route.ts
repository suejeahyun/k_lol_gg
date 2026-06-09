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

function normalizeSearch(value: string | null) {
  return String(value || "").trim();
}

export async function GET(req: NextRequest) {
  const admin = await requireAdminRequest();
  if (!admin) return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 401 });

  const url = new URL(req.url);
  const search = normalizeSearch(url.searchParams.get("q"));
  const activeParam = url.searchParams.get("active");
  const where: any = {};
  if (activeParam === "true") where.isActive = true;
  if (activeParam === "false") where.isActive = false;
  if (search) {
    where.OR = [
      { targetName: { contains: search, mode: "insensitive" } },
      { targetNickname: { contains: search, mode: "insensitive" } },
      { targetTag: { contains: search, mode: "insensitive" } },
      { reason: { contains: search, mode: "insensitive" } },
      { userAccount: { userId: { contains: search, mode: "insensitive" } } },
      { player: { name: { contains: search, mode: "insensitive" } } },
      { player: { nickname: { contains: search, mode: "insensitive" } } },
    ];
  }

  const [records, activeWarnings, activeCautions] = await Promise.all([
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
  ]);

  return NextResponse.json({
    ok: true,
    summary: { activeWarnings, activeCautions },
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
  const note = String(body.note || "").trim() || null;

  if (!reason) return NextResponse.json({ message: "사유가 필요합니다." }, { status: 400 });

  const user = userAccountId ? await prisma.userAccount.findUnique({
    where: { id: userAccountId },
    include: { player: true },
  }) : null;
  const player = playerId ? await prisma.player.findUnique({ where: { id: playerId }, include: { userAccount: true } }) : null;
  const targetPlayer = player || user?.player || null;

  if (!user && !targetPlayer && !body.targetName) {
    return NextResponse.json({ message: "대상 유저 또는 이름이 필요합니다." }, { status: 400 });
  }

  const created = await prisma.userDisciplineRecord.create({
    data: {
      userAccountId: user?.id || targetPlayer?.userAccountId || null,
      playerId: targetPlayer?.id || null,
      targetName: String(body.targetName || targetPlayer?.name || user?.userId || "대상 미상"),
      targetNickname: targetPlayer?.nickname || null,
      targetTag: targetPlayer?.tag || null,
      type,
      source,
      reason,
      note,
      createdBy: admin.user.userId,
    },
  });

  return NextResponse.json({ ok: true, record: created });
}
