import { NextRequest, NextResponse } from "next/server";
import { EventNoticeType } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";

type RouteContext = {
  params: Promise<{
    eventNoticeId: string;
  }>;
};

function isEventNoticeType(value: string): value is EventNoticeType {
  return Object.values(EventNoticeType).includes(value as EventNoticeType);
}

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const { eventNoticeId } = await params;
    const id = Number(eventNoticeId);

    if (Number.isNaN(id)) {
      return NextResponse.json(
        { message: "Invalid eventNoticeId" },
        { status: 400 }
      );
    }

    const notice = await prisma.eventNotice.findUnique({
      where: { id },
    });

    if (!notice) {
      return NextResponse.json(
        { message: "이벤트 공지를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    return NextResponse.json(notice);
  } catch (error) {
    console.error("[EVENT_NOTICE_GET_ERROR]", error);

    return NextResponse.json(
      { message: "이벤트 공지 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    const { eventNoticeId } = await params;
    const id = Number(eventNoticeId);

    if (Number.isNaN(id)) {
      return NextResponse.json(
        { message: "Invalid eventNoticeId" },
        { status: 400 }
      );
    }

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

    const notice = await prisma.eventNotice.update({
      where: { id },
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

    return NextResponse.json(notice);
  } catch (error) {
    console.error("[EVENT_NOTICE_PATCH_ERROR]", error);

    return NextResponse.json(
      { message: "이벤트 공지 수정 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  try {
    const { eventNoticeId } = await params;
    const id = Number(eventNoticeId);

    if (Number.isNaN(id)) {
      return NextResponse.json(
        { message: "Invalid eventNoticeId" },
        { status: 400 }
      );
    }

    await prisma.eventNotice.delete({
      where: { id },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[EVENT_NOTICE_DELETE_ERROR]", error);

    return NextResponse.json(
      { message: "이벤트 공지 삭제 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}