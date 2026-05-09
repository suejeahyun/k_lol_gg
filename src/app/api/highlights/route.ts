export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { writeAdminLog } from "@/lib/admin-log";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";
import { normalizeGalleryImageUrl } from "@/lib/gallery/winner-image-paths";
import { extractYoutubeId, getYoutubeThumbnailUrl, getYoutubeWatchUrl } from "@/lib/youtube";

type HighlightBody = {
  title?: string;
  description?: string;
  youtubeUrl?: string;
  thumbnailUrl?: string;
  isPublished?: boolean;
  sortOrder?: number | string;
};

export async function GET() {
  try {
    const highlights = await prisma.highlight.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    });

    return NextResponse.json(highlights);
  } catch (error) {
    console.error("[HIGHLIGHTS_GET_ERROR]", error);
    return NextResponse.json(
      { message: "하이라이트 목록 조회 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  try {
    const body = (await req.json()) as HighlightBody;

    const title = body.title?.trim();
    const description = body.description?.trim();
    const youtubeId = extractYoutubeId(body.youtubeUrl ?? "");
    const thumbnailUrl = normalizeGalleryImageUrl(body.thumbnailUrl ?? "") || null;
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

    const created = await prisma.highlight.create({
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
      action: "HIGHLIGHT_CREATE",
      message: `하이라이트 등록: #${created.id} ${created.title}`,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("[HIGHLIGHTS_POST_ERROR]", error);
    return NextResponse.json(
      { message: "하이라이트 등록 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
