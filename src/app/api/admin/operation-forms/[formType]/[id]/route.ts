export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { writeAdminLog } from "@/lib/admin-log";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";
import {
  isKakaoOperationFormStatus,
  type KakaoOperationFormType,
} from "@/lib/kakao/operation-forms";

type RouteContext = {
  params: Promise<{
    formType: string;
    id: string;
  }>;
};

function isFormType(value: string): value is KakaoOperationFormType {
  return ["friends", "suggestions", "meetups", "leaves"].includes(value);
}

async function updateItem(type: KakaoOperationFormType, id: number, data: { status?: string; memo?: string | null }) {
  if (type === "friends") return prisma.kakaoFriendApplication.update({ where: { id }, data });
  if (type === "suggestions") return prisma.kakaoSuggestionRequest.update({ where: { id }, data });
  if (type === "meetups") return prisma.kakaoMeetupRecord.update({ where: { id }, data });
  return prisma.kakaoLeaveRequest.update({ where: { id }, data });
}

async function deleteItem(type: KakaoOperationFormType, id: number) {
  if (type === "friends") return prisma.kakaoFriendApplication.delete({ where: { id } });
  if (type === "suggestions") return prisma.kakaoSuggestionRequest.delete({ where: { id } });
  if (type === "meetups") return prisma.kakaoMeetupRecord.delete({ where: { id } });
  return prisma.kakaoLeaveRequest.delete({ where: { id } });
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  try {
    const { formType, id: idText } = await context.params;
    const id = Number(idText);

    if (!isFormType(formType) || Number.isNaN(id)) {
      return NextResponse.json({ message: "올바르지 않은 운영 양식 ID입니다." }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const status = body.status;
    const memo = typeof body.memo === "string" ? body.memo.trim() || null : undefined;

    if (status !== undefined && !isKakaoOperationFormStatus(status)) {
      return NextResponse.json({ message: "올바르지 않은 상태값입니다." }, { status: 400 });
    }

    const updated = await updateItem(formType, id, {
      ...(status ? { status } : {}),
      ...(memo !== undefined ? { memo } : {}),
    });

    await writeAdminLog({
      action: "KAKAO_OPERATION_FORM_UPDATE",
      message: `카카오 운영 양식 수정: ${formType} #${id}`,
    });

    return NextResponse.json({ ok: true, item: updated });
  } catch (error) {
    console.error("[ADMIN_OPERATION_FORM_PATCH_ERROR]", error);
    return NextResponse.json({ message: "운영 양식 수정에 실패했습니다." }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, context: RouteContext) {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  try {
    const { formType, id: idText } = await context.params;
    const id = Number(idText);

    if (!isFormType(formType) || Number.isNaN(id)) {
      return NextResponse.json({ message: "올바르지 않은 운영 양식 ID입니다." }, { status: 400 });
    }

    await deleteItem(formType, id);

    await writeAdminLog({
      action: "KAKAO_OPERATION_FORM_DELETE",
      message: `카카오 운영 양식 삭제: ${formType} #${id}`,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[ADMIN_OPERATION_FORM_DELETE_ERROR]", error);
    return NextResponse.json({ message: "운영 양식 삭제에 실패했습니다." }, { status: 500 });
  }
}
