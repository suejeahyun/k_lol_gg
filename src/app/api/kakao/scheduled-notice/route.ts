export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { rejectIfRateLimited } from "@/lib/rate-limit";
import { generateOperationNotice, saveGeneratedNoticeLog } from "@/lib/operation-ai/addons/analytics";
import type { NoticeType } from "@/lib/operation-ai/addons/types";

function jsonReply(reply: string, extra: Record<string, unknown> = {}, status = 200) {
  return NextResponse.json(
    { reply, ...extra },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

function rejectIfInvalidSecret(req: NextRequest) {
  const secret = process.env.KAKAO_OPENCHAT_SECRET;
  if (!secret) return null;

  const headerSecret = req.headers.get("x-kakao-openchat-secret");
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const querySecret = req.nextUrl.searchParams.get("secret");

  if (headerSecret === secret || bearer === secret || querySecret === secret) return null;
  return jsonReply("인증되지 않은 요청입니다.", {}, 401);
}

async function createNotice(req: NextRequest, body?: { slot?: string | number | null; type?: NoticeType; roomName?: string | null }) {
  const secretRejected = rejectIfInvalidSecret(req);
  if (secretRejected) return secretRejected;

  const rateLimitRejected = await rejectIfRateLimited(req, {
    action: "KAKAO_SCHEDULED_NOTICE",
    limit: 20,
    windowSeconds: 60,
  });
  if (rateLimitRejected) return rateLimitRejected;

  const slot = body?.slot ?? req.nextUrl.searchParams.get("slot") ?? req.nextUrl.searchParams.get("hour");
  const type = body?.type ?? ((req.nextUrl.searchParams.get("type") || undefined) as NoticeType | undefined);
  const roomName = body?.roomName ?? req.nextUrl.searchParams.get("room") ?? null;

  const notice = await generateOperationNotice({ slot, type, roomName });
  const request = await saveGeneratedNoticeLog(notice).catch(() => null);

  return jsonReply(notice.text, { notice, requestId: request?.id ?? null });
}

export async function GET(req: NextRequest) {
  try {
    return await createNotice(req);
  } catch (error) {
    console.error("[KAKAO_SCHEDULED_NOTICE_GET_ERROR]", error);
    return jsonReply("AI 자동 공지 생성 중 오류가 발생했습니다.", {}, 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { slot?: string | number | null; type?: NoticeType; roomName?: string | null };
    return await createNotice(req, body);
  } catch (error) {
    console.error("[KAKAO_SCHEDULED_NOTICE_POST_ERROR]", error);
    return jsonReply("AI 자동 공지 생성 중 오류가 발생했습니다.", {}, 500);
  }
}
