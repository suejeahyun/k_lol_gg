import { NextResponse } from "next/server";
import { authorizeApiRole } from "@/modules/auth/infrastructure/server-authorization";

export const dynamic = "force-dynamic";

export async function GET() {
  const decision = await authorizeApiRole("ADMIN");
  if (!decision.allowed) {
    const status = decision.reason === "UNAUTHENTICATED" ? 401 : 403;
    return NextResponse.json(
      { message: status === 401 ? "로그인이 필요합니다." : "관리자 권한이 필요합니다." },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    {
      user: {
        id: decision.session.userId,
        role: decision.session.role,
        source: decision.session.source,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
