export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdminRequest } from "@/lib/auth/requireAdmin";
import { generateOperationNotice, saveGeneratedNoticeLog } from "@/lib/operation-ai/addons/analytics";
import type { NoticeType } from "@/lib/operation-ai/addons/types";

type NoticeWriterBody = {
  type?: NoticeType;
  slot?: string | number | null;
  roomName?: string | null;
  saveLog?: boolean;
};

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdminRequest();
    if (!admin) {
      return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as NoticeWriterBody;
    const notice = await generateOperationNotice({
      type: body.type,
      slot: body.slot,
      roomName: body.roomName,
    });

    const request = body.saveLog === false ? null : await saveGeneratedNoticeLog(notice).catch(() => null);

    return NextResponse.json({ ...notice, requestId: request?.id ?? null }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[OPERATION_AI_NOTICE_WRITER_POST_ERROR]", error);
    return NextResponse.json(
      { message: "AI 공지 생성 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const admin = await requireAdminRequest();
    if (!admin) {
      return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 401 });
    }

    const notice = await generateOperationNotice({
      type: (req.nextUrl.searchParams.get("type") || undefined) as NoticeType | undefined,
      slot: req.nextUrl.searchParams.get("slot"),
      roomName: req.nextUrl.searchParams.get("roomName"),
    });

    return NextResponse.json(notice, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[OPERATION_AI_NOTICE_WRITER_GET_ERROR]", error);
    return NextResponse.json(
      { message: "AI 공지 생성 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
