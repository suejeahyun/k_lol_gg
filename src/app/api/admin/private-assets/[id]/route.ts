export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdminRequest } from "@/lib/auth/requireAdmin";
import { prisma } from "@/lib/prisma/client";
import { downloadPrivateAsset } from "@/lib/storage/private-assets";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireAdminRequest()) return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 401 });
  const id = Number((await params).id);
  const asset = await prisma.privateAsset.findUnique({ where: { id } });
  if (!asset || asset.deletedAt) return NextResponse.json({ message: "이미지를 찾을 수 없습니다." }, { status: 404 });
  const bytes = await downloadPrivateAsset(asset.storageKey);
  return new NextResponse(bytes, { headers: { "Content-Type": asset.mimeType, "Content-Length": String(bytes.length), "Cache-Control": "private, no-store", "Content-Disposition": `inline; filename="asset-${asset.id}"` } });
}
