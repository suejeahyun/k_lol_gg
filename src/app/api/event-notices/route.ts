export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { EventNoticeType } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { writeAdminLog } from "@/lib/admin-log";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";
import { PUBLIC_SHORT_CACHE_HEADER } from "@/lib/http/cache";

function isEventNoticeType(value: string): value is EventNoticeType {
  return Object.values(EventNoticeType).includes(value as EventNoticeType);
}

export async function GET() {
  try {
    const notices = await prisma.eventNotice.findMany({
      orderBy: [
        { isPinned: "desc" },
        { createdAt: "desc" },
      ],
      take: 100,
    });

    return NextResponse.json(notices, {
      headers: {
        "Cache-Control": PUBLIC_SHORT_CACHE_HEADER,
      },
    });
  } catch (error) {
    console.error("[EVENT_NOTICES_GET_ERROR]", error);

    return NextResponse.json(
      { message: "이벤트 공지 목록 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  try {
    const body = await req.json();

    const title = String(body.title ?? "").trim();
    const content = String(body.content ?? "").trim();
    const type = String(body.type ?? "");
    const recruitInfo = String(body.recruitInfo ?? "").trim();
    const rule = String(body.rule ?? "").trim();
    const isPinned = Boolean(body.isPinned);
    const startDate = body.startDate ? new Date(body.startDate) : null;

    if (!title) {
      return NextResponse.json(
        { message: "제목을 입력해주세요." },
        { status: 400 }
      );
    }

    if (!content) {
      return NextResponse.json(
        { message: "내용을 입력해주세요." },
        { status: 400 }
      );
    }

    if (!isEventNoticeType(type)) {
      return NextResponse.json(
        { message: "이벤트 종류가 올바르지 않습니다." },
        { status: 400 }
      );
    }

    if (startDate && Number.isNaN(startDate.getTime())) {
      return NextResponse.json(
        { message: "이벤트 일시 형식이 올바르지 않습니다." },
        { status: 400 }
      );
    }

    const notice = await prisma.eventNotice.create({
      data: {
        title,
        content,
        type,
        recruitInfo: recruitInfo || null,
        rule: rule || null,
        startDate,
        isPinned,
      },
    });

    await writeAdminLog({
      action: "EVENT_NOTICE_CREATE",
      message: `이벤트 공지 등록: #${notice.id} ${notice.title}`,
    });

    return NextResponse.json(notice, { status: 201 });
  } catch (error) {
    console.error("[EVENT_NOTICES_POST_ERROR]", error);

    return NextResponse.json(
      { message: "이벤트 공지 등록 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
