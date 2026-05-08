export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { writeAdminLog } from "@/lib/admin-log";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";
import { extractYoutubeId, getYoutubeThumbnailUrl, getYoutubeWatchUrl } from "@/lib/youtube";

type RouteContext = {
  params: Promise<{
    highlightId: string;
  }>;
};

type HighlightBody = {
  title?: string;
  description?: string;
  youtubeUrl?: string;
  thumbnailUrl?: string;
  isPublished?: boolean;
  sortOrder?: number | string;
};

async function getId(context: RouteContext) {
  const { highlightId } = await context.params;
  const id = Number(highlightId);

  if (Number.isNaN(id)) return null;

  return id;
}

export async function GET(_: NextRequest, context: RouteContext) {
  try {
    const id = await getId(context);

    if (!id) {
      return NextResponse.json(
        { message: "올바른 하이라이트 ID가 아닙니다." },
        { status: 400 },
      );
    }

    const highlight = await prisma.highlight.findUnique({
      where: { id },
    });

    if (!highlight) {
      return NextResponse.json(
        { message: "하이라이트를 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    return NextResponse.json(highlight);
  } catch (error) {
    console.error("[HIGHLIGHT_GET_ERROR]", error);
    return NextResponse.json(
      { message: "하이라이트 조회 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  try {
    const id = await getId(context);

    if (!id) {
      return NextResponse.json(
        { message: "올바른 하이라이트 ID가 아닙니다." },
        { status: 400 },
      );
    }

    const body = (await req.json()) as HighlightBody;

    const title = body.title?.trim();
    const description = body.description?.trim();
    const youtubeId = extractYoutubeId(body.youtubeUrl ?? "");
    const thumbnailUrl = body.thumbnailUrl?.trim() || null;
    const sortOrder = Number(body.sortOrder ?? 0);

    if (!title) {
      return NextResponse.json({ message: "제목을 입력해주세요." }, { status: 400 });
    }

    if (!description) {
      return NextResponse.json({ message: "설명을 입력해주세요." }, { status: 400 });
    }

    if (!youtubeId) {
      return NextResponse.json(
        { message: "올바른 YouTube URL을 입력해주세요." },
        { status: 400 },
      );
    }

    if (!Number.isFinite(sortOrder)) {
      return NextResponse.json(
        { message: "정렬 순서는 숫자로 입력해주세요." },
        { status: 400 },
      );
    }

    const updated = await prisma.highlight.update({
      where: { id },
      data: {
        title,
        description,
        youtubeUrl: getYoutubeWatchUrl(youtubeId),
        youtubeId,
        thumbnailUrl: thumbnailUrl || getYoutubeThumbnailUrl(youtubeId),
        isPublished: body.isPublished ?? true,
        sortOrder,
      },
    });

    await writeAdminLog({
      action: "HIGHLIGHT_UPDATE",
      message: `하이라이트 수정: #${updated.id} ${updated.title}`,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[HIGHLIGHT_PATCH_ERROR]", error);
    return NextResponse.json(
      { message: "하이라이트 수정 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}

export async function DELETE(_: NextRequest, context: RouteContext) {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  try {
    const id = await getId(context);

    if (!id) {
      return NextResponse.json(
        { message: "올바른 하이라이트 ID가 아닙니다." },
        { status: 400 },
      );
    }

    const existing = await prisma.highlight.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { message: "하이라이트를 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    await prisma.highlight.delete({
      where: { id },
    });

    await writeAdminLog({
      action: "HIGHLIGHT_DELETE",
      message: `하이라이트 삭제: #${existing.id} ${existing.title}`,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[HIGHLIGHT_DELETE_ERROR]", error);
    return NextResponse.json(
      { message: "하이라이트 삭제 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
