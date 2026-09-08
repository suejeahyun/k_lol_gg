import { legacyKakaoRecruitTransitionResponse } from "@/modules/recruiting/infrastructure/legacy-kakao-recruit-transition";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function transition(request: Request, context: { params: Promise<{ action: string }> }) {
  const { action } = await context.params;
  return legacyKakaoRecruitTransitionResponse({ group: "scrim", action, method: request.method });
}

export const GET = transition;
export const POST = transition;
