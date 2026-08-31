export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdminRequest } from "@/lib/auth/requireAdmin";
import { prisma } from "@/lib/prisma/client";
import { resolvePrivateAssetLifecycle } from "@/lib/storage/private-asset-lifecycle";

const PRIVATE_NO_STORE = "private, no-store, max-age=0";

export async function GET() {
  const admin = await requireAdminRequest();
  if (!admin) {
    return NextResponse.json(
      { message: "관리자 권한이 필요합니다." },
      { status: 401, headers: { "Cache-Control": PRIVATE_NO_STORE } },
    );
  }

  const assets = await prisma.privateAsset.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 100,
    select: {
      purpose: true,
      mimeType: true,
      byteSize: true,
      expiresAt: true,
      deletedAt: true,
      createdAt: true,
      _count: {
        select: {
          disciplineEvidence: true,
          inhouseImages: true,
          inboundImages: true,
        },
      },
    },
  });

  return NextResponse.json(
    {
      items: assets.map((asset) => ({
        purpose: asset.purpose,
        mimeType: asset.mimeType,
        byteSize: asset.byteSize,
        lifecycle:
          resolvePrivateAssetLifecycle(asset) === "DELETED"
            ? "UNAVAILABLE"
            : resolvePrivateAssetLifecycle(asset),
        expiresAt: asset.expiresAt?.toISOString() ?? null,
        createdAt: asset.createdAt.toISOString(),
        relationCount:
          asset._count.disciplineEvidence +
          asset._count.inhouseImages +
          asset._count.inboundImages,
      })),
    },
    { headers: { "Cache-Control": PRIVATE_NO_STORE } },
  );
}
