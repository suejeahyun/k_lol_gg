import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

type RouteContext = {
  params: Promise<{
    imageId: string;
  }>;
};

type UpdateGalleryImageBody = {
  title: string;
  description: string;
  imageUrls: string[];
};

export async function GET(_: NextRequest, context: RouteContext) {
  try {
    const { imageId } = await context.params;
    const id = Number(imageId);

    if (Number.isNaN(id)) {
      return NextResponse.json(
        { message: "올바른 이미지 ID가 아닙니다." },
        { status: 400 }
      );
    }

    const image = await prisma.galleryImage.findUnique({
      where: { id },
    });

    if (!image) {
      return NextResponse.json(
        { message: "이미지를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    return NextResponse.json(image);
  } catch (error) {
    console.error("[GALLERY_IMAGE_GET_ERROR]", error);
    return NextResponse.json(
      { message: "이미지 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const { imageId } = await context.params;
    const id = Number(imageId);

    if (Number.isNaN(id)) {
      return NextResponse.json(
        { message: "올바른 이미지 ID가 아닙니다." },
        { status: 400 }
      );
    }

    const body = (await req.json()) as UpdateGalleryImageBody;
    const title = body.title?.trim();
    const description = body.description?.trim();
    const imageUrls = Array.isArray(body.imageUrls)
      ? body.imageUrls.map((url) => url.trim()).filter(Boolean)
      : [];

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

    if (imageUrls.length === 0) {
      return NextResponse.json(
        { message: "이미지를 최소 1개 이상 입력해주세요." },
        { status: 400 }
      );
    }

    if (imageUrls.length > 5) {
      return NextResponse.json(
        { message: "이미지는 최대 5개까지 등록할 수 있습니다." },
        { status: 400 }
      );
    }

    const updated = await prisma.galleryImage.update({
      where: { id },
      data: {
        title,
        description,
        imageUrls,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[GALLERY_IMAGE_PATCH_ERROR]", error);
    return NextResponse.json(
      { message: "이미지 수정 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

export async function DELETE(_: NextRequest, context: RouteContext) {
  try {
    const { imageId } = await context.params;
    const id = Number(imageId);

    if (Number.isNaN(id)) {
      return NextResponse.json(
        { message: "올바른 이미지 ID가 아닙니다." },
        { status: 400 }
      );
    }

    await prisma.galleryImage.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[GALLERY_IMAGE_DELETE_ERROR]", error);
    return NextResponse.json(
      { message: "이미지 삭제 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}