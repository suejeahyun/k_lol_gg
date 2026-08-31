export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdminRequest } from "@/lib/auth/requireAdmin";
import { canViewPrivateAsset } from "@/lib/auth/admin-security-policy";
import { prisma } from "@/lib/prisma/client";
import { resolvePrivateAssetLifecycle } from "@/lib/storage/private-asset-lifecycle";

const PRIVATE_NO_STORE = "private, no-store, max-age=0";

function safeResponse(
  body: { state: "ACTIVE" | "EXPIRED" | "UNAVAILABLE"; purpose?: string; mimeType?: string },
  status: number,
) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": PRIVATE_NO_STORE },
  });
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdminRequest();
    if (!admin) return safeResponse({ state: "UNAVAILABLE" }, 401);

    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) {
      return safeResponse({ state: "UNAVAILABLE" }, 404);
    }

    const asset = await prisma.privateAsset.findUnique({
      where: { id },
      select: {
        purpose: true,
        mimeType: true,
        expiresAt: true,
        deletedAt: true,
      },
    });
    if (!asset || asset.deletedAt || !canViewPrivateAsset(admin.user.role, asset.purpose)) {
      return safeResponse({ state: "UNAVAILABLE" }, 404);
    }

    const lifecycle = resolvePrivateAssetLifecycle(asset);
    if (lifecycle === "EXPIRED") {
      return safeResponse({ state: "EXPIRED", purpose: asset.purpose }, 410);
    }
    if (lifecycle !== "ACTIVE") {
      return safeResponse({ state: "UNAVAILABLE" }, 404);
    }

    return safeResponse(
      { state: "ACTIVE", purpose: asset.purpose, mimeType: asset.mimeType },
      200,
    );
  } catch {
    return safeResponse({ state: "UNAVAILABLE" }, 500);
  }
}
