import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { validateNoticeInput } from "@/validations/notice";

type NoticeRouteContext = {
  params: Promise<{
    noticeId: string;
  }>;
};

export async function GET(_: NextRequest, context: NoticeRouteContext) {
  try {
    const { noticeId } = await context.params;
    const id = Number(noticeId);

    if (Number.isNaN(id)) {
      return NextResponse.json(
        { message: "올바르지 않은 공지 ID입니다." },
        { status: 400 }
      );
    }

    const notice = await prisma.notice.findUnique({
      where: { id },
    });

    if (!notice) {
      return NextResponse.json(
        { message: "공지사항을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    return NextResponse.json(notice);
  } catch (error) {
    console.error("[NOTICE_GET_ERROR]", error);

    return NextResponse.json(
      { message: "공지사항 조회에 실패했습니다." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, context: NoticeRouteContext) {
  try {
    const { noticeId } = await context.params;
    const id = Number(noticeId);

    if (Number.isNaN(id)) {
      return NextResponse.json(
        { message: "올바르지 않은 공지 ID입니다." },
        { status: 400 }
      );
    }

    const existingNotice = await prisma.notice.findUnique({
      where: { id },
    });

    if (!existingNotice) {
      return NextResponse.json(
        { message: "공지사항을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const body = await req.json();
    const validated = validateNoticeInput(body);

    if (!validated.success) {
      return NextResponse.json(
        { message: validated.message },
        { status: 400 }
      );
    }

    const updatedNotice = await prisma.notice.update({
      where: { id },
      data: {
        title: validated.data.title,
        content: validated.data.content,
        isPinned: validated.data.isPinned ?? false,
      },
    });

    return NextResponse.json(updatedNotice);
  } catch (error) {
    console.error("[NOTICE_PATCH_ERROR]", error);

    return NextResponse.json(
      { message: "공지사항 수정에 실패했습니다." },
      { status: 500 }
    );
  }
}

export async function DELETE(_: NextRequest, context: NoticeRouteContext) {
  try {
    const { noticeId } = await context.params;
    const id = Number(noticeId);

    if (Number.isNaN(id)) {
      return NextResponse.json(
        { message: "올바르지 않은 공지 ID입니다." },
        { status: 400 }
      );
    }

    const existingNotice = await prisma.notice.findUnique({
      where: { id },
    });

    if (!existingNotice) {
      return NextResponse.json(
        { message: "공지사항을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    await prisma.notice.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[NOTICE_DELETE_ERROR]", error);

    return NextResponse.json(
      { message: "공지사항 삭제에 실패했습니다." },
      { status: 500 }
    );
  }
}