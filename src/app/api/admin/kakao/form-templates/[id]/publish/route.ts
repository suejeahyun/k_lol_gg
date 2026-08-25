export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdminRequest } from "@/lib/auth/requireAdmin";
import { prisma } from "@/lib/prisma/client";
import { requireSiteFeature } from "@/lib/site/feature-guard";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const premiumLock = await requireSiteFeature("kakao");
  if (premiumLock) return premiumLock;
  const admin = await requireAdminRequest();
  if (!admin) return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 401 });
  const id = Number((await params).id);
  const target = await prisma.kakaoFormTemplate.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ message: "양식을 찾을 수 없습니다." }, { status: 404 });
  await prisma.$transaction(async (tx) => {
    await tx.kakaoFormTemplate.updateMany({ where: { formType: target.formType, status: "PUBLISHED" }, data: { status: "ARCHIVED" } });
    await tx.kakaoFormTemplate.update({ where: { id }, data: { status: "PUBLISHED", publishedAt: new Date(), publishedById: admin.user.id } });
  });
  return NextResponse.json({ ok: true });
}
