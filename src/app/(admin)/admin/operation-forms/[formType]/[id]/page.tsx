export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma/client";
import {
  extractKakaoLeaveScopeFromText,
  kakaoOperationFormLabels,
  type KakaoOperationFormType,
} from "@/lib/kakao/operation-forms";
import KakaoOperationFormDetailClient from "@/components/admin/KakaoOperationFormDetailClient";

type Props = {
  params: Promise<{
    formType: string;
    id: string;
  }>;
};

function isFormType(value: string): value is KakaoOperationFormType {
  return ["suggestions", "meetups", "leaves"].includes(value);
}

async function getItem(type: KakaoOperationFormType, id: number) {
  if (type === "suggestions") {
    const item = await prisma.kakaoSuggestionRequest.findUnique({ where: { id } });
    if (!item) return null;
    return {
      id: item.id,
      type,
      title: kakaoOperationFormLabels[type],
      status: item.status,
      memo: item.memo,
      rawText: item.rawText,
      roomName: item.roomName,
      sender: item.sender,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      fields: [
        { label: "본인 이름 및 닉네임", value: item.requesterInfo },
        { label: "건의 사유", value: item.reason },
        { label: "건의 내용", value: item.content },
      ],
    };
  }

  if (type === "meetups") {
    const item = await prisma.kakaoMeetupRecord.findUnique({ where: { id } });
    if (!item) return null;
    return {
      id: item.id,
      type,
      title: kakaoOperationFormLabels[type],
      status: item.status,
      memo: item.memo,
      rawText: item.rawText,
      roomName: item.roomName,
      sender: item.sender,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      fields: [
        { label: "주최자 이름 및 닉네임", value: item.hostInfo },
        { label: "일자", value: item.eventDateText },
        { label: "장소", value: item.place },
        { label: "참여자 명단", value: item.participants },
      ],
    };
  }

  const item = await prisma.kakaoLeaveRequest.findUnique({ where: { id } });
  if (!item) return null;
  const parsedScope = extractKakaoLeaveScopeFromText(item.rawText);
  const displayScope = item.scope && item.scope !== "미입력" ? item.scope : parsedScope || item.scope || "미입력";
  return {
    id: item.id,
    type,
    title: kakaoOperationFormLabels[type],
    status: item.status,
    memo: item.memo,
    rawText: item.rawText,
    roomName: item.roomName,
    sender: item.sender,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    fields: [
      { label: "이름 및 닉네임", value: item.requesterInfo },
      { label: "외출 기간", value: item.leavePeriod },
      { label: "외출 사유", value: item.reason },
      { label: "외출 범위", value: displayScope },
    ],
  };
}

export default async function AdminOperationFormDetailPage({ params }: Props) {
  const { formType, id: idText } = await params;
  const id = Number(idText);
  if (!isFormType(formType) || !Number.isInteger(id) || id <= 0) notFound();

  const item = await getItem(formType, id);
  if (!item) notFound();

  return <KakaoOperationFormDetailClient item={item} />;
}
