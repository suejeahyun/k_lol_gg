export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdminRequest } from "@/lib/auth/requireAdmin";
import { prisma } from "@/lib/prisma/client";
import { downloadPrivateAsset } from "@/lib/storage/private-assets";
import { canViewPrivateAsset } from "@/lib/auth/admin-security-policy";
import { writeSecurityAudit } from "@/lib/security/admin-audit";
import { isPrivateAssetExpired } from "@/lib/storage/private-asset-lifecycle";

const PRIVATE_NO_STORE = "private, no-store, max-age=0";

function jsonError(body: { ok?: false; code?: string; message: string }, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": PRIVATE_NO_STORE },
  });
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminRequest();
  if (!admin) return jsonError({ message: "관리자 권한이 필요합니다." }, 401);
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return jsonError({ message: "이미지 ID가 올바르지 않습니다." }, 400);
  }
  const asset = await prisma.privateAsset.findUnique({
    where: { id },
    select: {
      id: true,
      purpose: true,
      storageKey: true,
      mimeType: true,
      expiresAt: true,
      deletedAt: true,
    },
  });
  if (!asset || asset.deletedAt) return jsonError({ message: "이미지를 찾을 수 없습니다." }, 404);

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
    return jsonError({ message: "이 비공개 이미지를 볼 수 있는 권한이 없습니다." }, 403);
  }

  if (isPrivateAssetExpired(asset)) {
    await writeSecurityAudit({
      req,
      admin,
      action: "PRIVATE_ASSET_VIEW_EXPIRED",
      message: "보관 기간이 끝난 비공개 증빙 열람 차단",
      targetType: "PrivateAsset",
      targetId: asset.id,
      afterJson: { purpose: asset.purpose, allowed: false, reason: "EXPIRED" },
    });
    return jsonError(
      {
        ok: false,
        code: "ASSET_EXPIRED",
        message: "보관 기간이 끝난 증빙입니다. 원본은 제공되지 않습니다.",
      },
      410,
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
  return new NextResponse(bytes, { headers: { "Content-Type": asset.mimeType, "Content-Length": String(bytes.length), "Cache-Control": PRIVATE_NO_STORE, "Content-Disposition": 'inline; filename="evidence-image"' } });
}
