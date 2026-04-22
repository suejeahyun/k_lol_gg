import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { validateNoticeInput } from "@/validations/notice";

export async function GET(req: NextRequest) {
  try {
    const page = Number(req.nextUrl.searchParams.get("page") ?? "1");
    const pageSize = Number(req.nextUrl.searchParams.get("pageSize") ?? "10");

    const safePage = Number.isNaN(page) || page < 1 ? 1 : page;
    const safePageSize =
      Number.isNaN(pageSize) || pageSize < 1 || pageSize > 100 ? 10 : pageSize;

    const skip = (safePage - 1) * safePageSize;

    const [notices, totalCount] = await Promise.all([
      prisma.notice.findMany({
        orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
        skip,
        take: safePageSize,
      }),
      prisma.notice.count(),
    ]);

    return NextResponse.json({
      notices,
      pagination: {
        page: safePage,
        pageSize: safePageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / safePageSize),
      },
    });
  } catch (error) {
    console.error("[NOTICES_GET_ERROR]", error);

    return NextResponse.json(
      { message: "공지사항 목록 조회에 실패했습니다." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validated = validateNoticeInput(body);

    if (!validated.success) {
      return NextResponse.json(
        { message: validated.message },
        { status: 400 }
      );
    }

    const notice = await prisma.notice.create({
      data: {
        title: validated.data.title,
        content: validated.data.content,
        isPinned: validated.data.isPinned ?? false,
      },
    });

    return NextResponse.json(notice, { status: 201 });
  } catch (error) {
    console.error("[NOTICE_POST_ERROR]", error);

    return NextResponse.json(
      { message: "공지사항 등록에 실패했습니다." },
      { status: 500 }
    );
  }
}