import { logServerError } from "@/lib/server/safe-log";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { writeAdminLog } from "@/lib/admin-log";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";
import { normalizeGalleryImageUrls } from "@/lib/gallery/winner-image-paths";
import { PUBLIC_SHORT_CACHE_HEADER } from "@/lib/http/cache";
import { getPaginationMeta, getSafePagination } from "@/lib/http/pagination";
import { readJsonObject } from "@/lib/http/json-body";

type CreateGalleryImageBody = {
  title: string;
  description: string;
  imageUrl: string[];
  showOnHome?: boolean;
};

export async function GET(req: NextRequest) {
  try {
    const wantsMeta =
      req.nextUrl.searchParams.has("page") ||
      req.nextUrl.searchParams.has("pageSize") ||
      req.nextUrl.searchParams.has("meta");

    const pagination = getSafePagination({
      page: req.nextUrl.searchParams.get("page"),
      pageSize: req.nextUrl.searchParams.get("pageSize"),
      defaultPageSize: 30,
      maxPageSize: 100,
    });

    const [images, totalCount] = await Promise.all([
      prisma.galleryImage.findMany({
        orderBy: [{ createdAt: "desc" }],
        skip: pagination.skip,
        take: pagination.take,
        select: {
          id: true,
          title: true,
          description: true,
          imageUrl: true,
          showOnHome: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.galleryImage.count(),
    ]);

    const meta = getPaginationMeta(totalCount, pagination);

    if (!wantsMeta) {
      return NextResponse.json(images, {
        headers: {
          "Cache-Control": PUBLIC_SHORT_CACHE_HEADER,
          "X-Total-Count": String(totalCount),
          "X-Page": String(meta.page),
          "X-Page-Size": String(meta.pageSize),
          "X-Total-Pages": String(meta.totalPages),
        },
      });
    }

    return NextResponse.json(
      { data: images, meta },
      {
        headers: {
          "Cache-Control": PUBLIC_SHORT_CACHE_HEADER,
        },
      },
    );
  } catch (error) {
    logServerError("[GALLERY_IMAGES_GET_ERROR]", error);

    return NextResponse.json(
      { message: "이미지 목록 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  try {
    const body = await readJsonObject<CreateGalleryImageBody>(req);
    if (!body) {
      return NextResponse.json(
        { message: "올바른 JSON 요청 본문이 필요합니다." },
        { status: 400 },
      );
    }

    const title = body.title?.trim();
    const description = body.description?.trim();
    const imageUrl = Array.isArray(body.imageUrl)
      ? normalizeGalleryImageUrls(body.imageUrl)
      : [];

    const showOnHome = Boolean(body.showOnHome);

    if (!title) {
      return NextResponse.json(
        { message: "제목을 입력해주세요." },
        { status: 400 }
      );
    }

    if (!description) {
      return NextResponse.json(
        { message: "설명을 입력해주세요." },
        { status: 400 }
      );
    }

    if (imageUrl.length === 0) {
      return NextResponse.json(
        { message: "이미지를 최소 1개 이상 입력해주세요." },
        { status: 400 }
      );
    }

    if (imageUrl.length > 5) {
      return NextResponse.json(
        { message: "이미지는 최대 5개까지 등록할 수 있습니다." },
        { status: 400 }
      );
    }

    const created = await prisma.galleryImage.create({
      data: {
        title,
        description,
        imageUrl,
        showOnHome,
      },
    });

    await writeAdminLog({
      action: "GALLERY_IMAGE_CREATE",
      message: `우승 이미지 등록: #${created.id} ${created.title}`,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    logServerError("[GALLERY_IMAGES_POST_ERROR]", error);

    return NextResponse.json(
      { message: "이미지 등록 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

