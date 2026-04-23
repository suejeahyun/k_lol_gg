import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

type CreateGalleryImageBody = {
  title: string;
  description: string;
  imageUrl: string[];
};

export async function GET() {
  try {
    const images = await prisma.galleryImage.findMany({
      orderBy: [{ createdAt: "desc" }],
    });

    return NextResponse.json(images);
  } catch (error) {
    console.error("[GALLERY_IMAGES_GET_ERROR]", error);
    return NextResponse.json(
      { message: "이미지 목록 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CreateGalleryImageBody;
    const title = body.title?.trim();
    const description = body.description?.trim();
    const imageUrl = Array.isArray(body.imageUrl)
      ? body.imageUrl.map((url) => url.trim()).filter(Boolean)
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
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("[GALLERY_IMAGES_POST_ERROR]", error);
    return NextResponse.json(
      { message: "이미지 등록 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}