import { NextResponse } from "next/server";
import { rejectIfNotSuperAdmin } from "@/lib/auth/requireAdmin";
import { requireSiteFeature } from "@/lib/site/feature-guard";

export const dynamic = "force-dynamic";

export async function POST() {
  const premiumLock = await requireSiteFeature("recruit");
  if (premiumLock) return premiumLock;

  const rejected = await rejectIfNotSuperAdmin();
  if (rejected) return rejected;

  return NextResponse.json(
    {
      ok: false,
      message: "모집번호 초기화는 사용하지 않습니다.",
    },
    { status: 410 },
  );
}
