export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdminRequest } from "@/lib/auth/requireAdmin";
import { prisma } from "@/lib/prisma/client";
import { downloadPrivateAsset } from "@/lib/storage/private-assets";
import { canViewPrivateAsset } from "@/lib/auth/admin-security-policy";
import { writeSecurityAudit } from "@/lib/security/admin-audit";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminRequest();
  if (!admin) return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ message: "이미지 ID가 올바르지 않습니다." }, { status: 400 });
  }
  const asset = await prisma.privateAsset.findUnique({ where: { id } });
  if (!asset || asset.deletedAt) return NextResponse.json({ message: "이미지를 찾을 수 없습니다." }, { status: 404 });

  if (!canViewPrivateAsset(admin.user.role, asset.purpose)) {
    await writeSecurityAudit({
      req,
      admin,
      action: "PRIVATE_ASSET_VIEW_DENIED",
      message: `비공개 이미지 열람 거부: asset #${asset.id} (${asset.purpose})`,
      targetType: "PrivateAsset",
      targetId: asset.id,
      afterJson: { purpose: asset.purpose, allowed: false },
    });
    return NextResponse.json(
      { message: "이 비공개 이미지를 볼 수 있는 권한이 없습니다." },
      { status: 403 },
    );
  }

  const bytes = await downloadPrivateAsset(asset.storageKey);
  await writeSecurityAudit({
    req,
    admin,
    action: "PRIVATE_ASSET_VIEW",
    message: `비공개 이미지 열람: asset #${asset.id} (${asset.purpose})`,
    targetType: "PrivateAsset",
    targetId: asset.id,
    afterJson: { purpose: asset.purpose, allowed: true },
  });
  return new NextResponse(bytes, { headers: { "Content-Type": asset.mimeType, "Content-Length": String(bytes.length), "Cache-Control": "private, no-store", "Content-Disposition": `inline; filename="asset-${asset.id}"` } });
}
