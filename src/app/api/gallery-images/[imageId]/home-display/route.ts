import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

type RouteContext = {
  params: Promise<{
    imageId: string;
  }>;
};

async function toggleHomeDisplay(imageId: string) {
  const id = Number(imageId);

  if (Number.isNaN(id)) {
    return NextResponse.json(
      { message: "올바르지 않은 이미지 ID입니다." },
      { status: 400 }
    );
  }

  const image = await prisma.galleryImage.findUnique({
    where: { id },
    select: {
      id: true,
      showOnHome: true,
    },
  });

  if (!image) {
    return NextResponse.json(
      { message: "이미지를 찾을 수 없습니다." },
      { status: 404 }
    );
  }

  await prisma.galleryImage.update({
    where: { id },
    data: {
      showOnHome: !image.showOnHome,
    },
  });

  return NextResponse.redirect(
    new URL("/admin/images", process.env.NEXT_PUBLIC_BASE_URL)
  );
}

export async function POST(_req: NextRequest, { params }: RouteContext) {
  try {
    const { imageId } = await params;
    return toggleHomeDisplay(imageId);
  } catch (error) {
    console.error("[GALLERY_HOME_DISPLAY_POST_ERROR]", error);

    return NextResponse.json(
      { message: "메인 노출 상태 변경 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    const { imageId } = await params;
    const id = Number(imageId);

    if (Number.isNaN(id)) {
      return NextResponse.json(
        { message: "올바르지 않은 이미지 ID입니다." },
        { status: 400 }
      );
    }

    const body = await req.json();

    const updated = await prisma.galleryImage.update({
      where: { id },
      data: {
        showOnHome: Boolean(body.showOnHome),
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[GALLERY_HOME_DISPLAY_PATCH_ERROR]", error);

    return NextResponse.json(
      { message: "메인 노출 상태 변경 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}