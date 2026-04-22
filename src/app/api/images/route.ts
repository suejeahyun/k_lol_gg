import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { validateGalleryImageInput } from "@/validations/gallery-image";

export async function GET(req: NextRequest) {
  try {
    const page = Number(req.nextUrl.searchParams.get("page") ?? "1");
    const pageSize = Number(req.nextUrl.searchParams.get("pageSize") ?? "12");

    const safePage = Number.isNaN(page) || page < 1 ? 1 : page;
    const safePageSize =
      Number.isNaN(pageSize) || pageSize < 1 || pageSize > 100 ? 12 : pageSize;

    const skip = (safePage - 1) * safePageSize;

    const [images, totalCount] = await Promise.all([
      prisma.galleryImage.findMany({
        orderBy: [{ createdAt: "desc" }],
        skip,
        take: safePageSize,
      }),
      prisma.galleryImage.count(),
    ]);

    return NextResponse.json({
      images,
      pagination: {
        page: safePage,
        pageSize: safePageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / safePageSize),
      },
    });
  } catch (error) {
    console.error("[IMAGES_GET_ERROR]", error);

    return NextResponse.json(
      { message: "이미지 목록 조회에 실패했습니다." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validated = validateGalleryImageInput(body);

    if (!validated.success) {
      return NextResponse.json(
        { message: validated.message },
        { status: 400 }
      );
    }

    const image = await prisma.galleryImage.create({
      data: {
        title: validated.data.title,
        description: validated.data.description,
        imageUrl: validated.data.imageUrl,
      },
    });

    return NextResponse.json(image, { status: 201 });
  } catch (error) {
    console.error("[IMAGE_POST_ERROR]", error);

    return NextResponse.json(
      { message: "이미지 등록에 실패했습니다." },
      { status: 500 }
    );
  }
}