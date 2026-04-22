import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { validateGalleryImageInput } from "@/validations/gallery-image";

type ImageRouteContext = {
  params: Promise<{
    imageId: string;
  }>;
};

export async function GET(_: NextRequest, context: ImageRouteContext) {
  try {
    const { imageId } = await context.params;
    const id = Number(imageId);

    if (Number.isNaN(id)) {
      return NextResponse.json(
        { message: "올바르지 않은 이미지 ID입니다." },
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
    console.error("[IMAGE_GET_ERROR]", error);

    return NextResponse.json(
      { message: "이미지 조회에 실패했습니다." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, context: ImageRouteContext) {
  try {
    const { imageId } = await context.params;
    const id = Number(imageId);

    if (Number.isNaN(id)) {
      return NextResponse.json(
        { message: "올바르지 않은 이미지 ID입니다." },
        { status: 400 }
      );
    }

    const existingImage = await prisma.galleryImage.findUnique({
      where: { id },
    });

    if (!existingImage) {
      return NextResponse.json(
        { message: "이미지를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const body = await req.json();
    const validated = validateGalleryImageInput(body);

    if (!validated.success) {
      return NextResponse.json(
        { message: validated.message },
        { status: 400 }
      );
    }

    const updatedImage = await prisma.galleryImage.update({
      where: { id },
      data: {
        title: validated.data.title,
        description: validated.data.description,
        imageUrl: validated.data.imageUrl,
      },
    });

    return NextResponse.json(updatedImage);
  } catch (error) {
    console.error("[IMAGE_PATCH_ERROR]", error);

    return NextResponse.json(
      { message: "이미지 수정에 실패했습니다." },
      { status: 500 }
    );
  }
}

export async function DELETE(_: NextRequest, context: ImageRouteContext) {
  try {
    const { imageId } = await context.params;
    const id = Number(imageId);

    if (Number.isNaN(id)) {
      return NextResponse.json(
        { message: "올바르지 않은 이미지 ID입니다." },
        { status: 400 }
      );
    }

    const existingImage = await prisma.galleryImage.findUnique({
      where: { id },
    });

    if (!existingImage) {
      return NextResponse.json(
        { message: "이미지를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    await prisma.galleryImage.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[IMAGE_DELETE_ERROR]", error);

    return NextResponse.json(
      { message: "이미지 삭제에 실패했습니다." },
      { status: 500 }
    );
  }
}