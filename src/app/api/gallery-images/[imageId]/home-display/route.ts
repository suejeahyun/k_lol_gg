import { logServerError } from "@/lib/server/safe-log";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { writeAdminLog } from "@/lib/admin-log";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";

type RouteContext = {
  params: Promise<{
    imageId: string;
  }>;
};

const REDIRECT_PATH = "/admin/images";

export async function POST(req: NextRequest, { params }: RouteContext) {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  try {
    const { imageId } = await params;
    const id = Number(imageId);

    if (Number.isNaN(id)) {
      return NextResponse.redirect(new URL(REDIRECT_PATH, req.url), 303);
    }

    const image = await prisma.galleryImage.findUnique({
      where: { id },
      select: {
        id: true,
        showOnHome: true,
      },
    });

    if (!image) {
      return NextResponse.redirect(new URL(REDIRECT_PATH, req.url), 303);
    }

    await prisma.$transaction(async (tx) => {
      if (image.showOnHome) {
        await tx.galleryImage.update({
          where: { id },
          data: {
            showOnHome: false,
          },
        });

        await writeAdminLog({
          action: "GALLERY_HOME_DISPLAY_OFF",
          message: `메인 우승 이미지 노출 해제: #${id}`,
          db: tx,
        });

        return;
      }

      await tx.galleryImage.updateMany({
        where: {
          showOnHome: true,
        },
        data: {
          showOnHome: false,
        },
      });

      await tx.galleryImage.update({
        where: { id },
        data: {
          showOnHome: true,
        },
      });

      await writeAdminLog({
        action: "GALLERY_HOME_DISPLAY_ON",
        message: `메인 우승 이미지 노출 설정: #${id}`,
        db: tx,
      });
    });

    return NextResponse.redirect(new URL(REDIRECT_PATH, req.url), 303);
  } catch (error) {
    logServerError("[GALLERY_HOME_DISPLAY_POST_ERROR]", error);

    return NextResponse.redirect(new URL(REDIRECT_PATH, req.url), 303);
  }
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  try {
    const { imageId } = await params;
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
      },
    });

    if (!image) {
      return NextResponse.json(
        { message: "이미지를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const body = (await req.json()) as {
      showOnHome?: boolean;
    };

    const showOnHome = body.showOnHome === true;

    const updatedImage = await prisma.$transaction(async (tx) => {
      if (showOnHome) {
        await tx.galleryImage.updateMany({
          where: {
            showOnHome: true,
          },
          data: {
            showOnHome: false,
          },
        });
      }

      const result = await tx.galleryImage.update({
        where: { id },
        data: {
          showOnHome,
        },
      });

      await writeAdminLog({
        action: showOnHome ? "GALLERY_HOME_DISPLAY_ON" : "GALLERY_HOME_DISPLAY_OFF",
        message: showOnHome
          ? `메인 우승 이미지 노출 설정: #${id}`
          : `메인 우승 이미지 노출 해제: #${id}`,
        db: tx,
      });

      return result;
    });

    return NextResponse.json(updatedImage);
  } catch (error) {
    logServerError("[GALLERY_HOME_DISPLAY_PATCH_ERROR]", error);

    return NextResponse.json(
      { message: "메인 노출 상태 변경 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

