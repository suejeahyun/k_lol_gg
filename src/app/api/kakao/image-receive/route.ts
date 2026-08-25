export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { kakaoJsonReply } from "@/lib/kakao/reply-format";
import { getKakaoOperationSettings } from "@/lib/kakao/settings";
import { isAuthorizedKakaoRequest, normalizeSessionKey } from "@/lib/kakao/request-auth";
import { deletePrivateAsset, storePrivateImage, validatePrivateImage } from "@/lib/storage/private-assets";
import { logServerError } from "@/lib/server/safe-log";
import { requireSiteFeature } from "@/lib/site/feature-guard";

function cleanBase64(value: unknown) {
  const raw = String(value ?? "").trim();
  return raw.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, "").replace(/\s+/g, "");
}

export async function POST(req: NextRequest) {
  const premiumLock = await requireSiteFeature("kakao");
  if (premiumLock) return premiumLock;
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    if (!isAuthorizedKakaoRequest(req, body.secret)) return kakaoJsonReply({ reply: "[K-LOL.GG 사진 접수 실패]\n인증값이 올바르지 않습니다." }, 401);
    const roomKey = normalizeSessionKey(String(body.roomName || body.room || ""));
    const senderKey = normalizeSessionKey(String(body.sender || ""));
    if (!roomKey || !senderKey) return kakaoJsonReply({ reply: "[K-LOL.GG 사진 접수 실패]\n방 이름과 보낸 사람 정보가 필요합니다." }, 400);
    const publicCode = String(body.publicCode || "").trim().toUpperCase();
    const session = await prisma.kakaoImageReceiveSession.findFirst({
      where: publicCode ? { publicCode, status: "ACTIVE" } : { roomKey, senderKey, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
    });
    if (!session || session.expiresAt <= new Date()) return kakaoJsonReply({ reply: "[K-LOL.GG 사진 접수 실패]\n진행 중인 사진 접수가 없거나 30분 세션이 만료되었습니다." }, 404);
    const settings = await getKakaoOperationSettings();
    if ((session.purpose === "INHOUSE_RESULT" && !settings.inhouseResultImageEnabled) || (session.purpose !== "INHOUSE_RESULT" && !settings.disciplineEvidenceEnabled)) {
      return kakaoJsonReply({ reply: settings.disabledFeatureMessage }, 403);
    }
    const encoded = cleanBase64(body.base64Image || body.imageBase64 || body.image);
    if (!encoded) return kakaoJsonReply({ reply: "[K-LOL.GG 사진 접수 실패]\n사진 데이터가 비어 있습니다." }, 400);
    const buffer = Buffer.from(encoded, "base64");
    const validated = await validatePrivateImage(buffer, typeof body.mimeType === "string" ? body.mimeType : null);
    const duplicate = await prisma.kakaoInboundImage.findFirst({ where: { sessionId: session.id, sha256: validated.sha256 } });
    if (duplicate) return kakaoJsonReply({ reply: `[K-LOL.GG 사진 접수]\n같은 사진이 이미 ${duplicate.imageNumber}번으로 접수되었습니다.` });
    const imageNumber = session.receivedImageCount + 1;
    if (session.expectedImageCount && imageNumber > session.expectedImageCount) return kakaoJsonReply({ reply: "[K-LOL.GG 사진 접수]\n필요한 사진이 모두 접수되었습니다." });
    const asset = await storePrivateImage({ buffer, purpose: session.purpose as "DISCIPLINE_ISSUE" | "DISCIPLINE_RESOLUTION" | "INHOUSE_RESULT", publicCode: session.publicCode, imageNumber, declaredMimeType: validated.mimeType });
    const complete = !session.expectedImageCount || imageNumber >= session.expectedImageCount;
    try {
      await prisma.$transaction(async (tx) => {
      await tx.kakaoInboundImage.create({ data: { sessionId: session.id, privateAssetId: asset.id, imageNumber, sourceEventKey: typeof body.sourceEventKey === "string" ? body.sourceEventKey : null, sha256: validated.sha256 } });
      if (session.purpose === "INHOUSE_RESULT") await tx.inhouseResultImage.create({ data: { submissionId: session.targetId, privateAssetId: asset.id, gameNumber: imageNumber } });
      if (session.purpose === "DISCIPLINE_RESOLUTION") await tx.disciplineEvidence.create({ data: { taskId: session.targetId, privateAssetId: asset.id } });
      await tx.kakaoImageReceiveSession.update({ where: { id: session.id }, data: { receivedImageCount: { increment: 1 }, status: complete ? "COMPLETE" : "ACTIVE" } });
      if (complete && session.purpose === "INHOUSE_RESULT") await tx.inhouseResultSubmission.update({ where: { id: session.targetId }, data: { status: "PENDING_REVIEW" } });
      if (complete && session.purpose === "DISCIPLINE_ISSUE") await tx.disciplineSubmission.update({ where: { id: session.targetId }, data: { status: "PENDING_REVIEW" } });
      if (complete && session.purpose === "DISCIPLINE_RESOLUTION") await tx.disciplineResolutionTask.update({ where: { id: session.targetId }, data: { status: "PENDING_REVIEW", submittedAt: new Date() } });
      });
    } catch (transactionError) {
      await deletePrivateAsset(asset.storageKey).catch(() => undefined);
      await prisma.privateAsset.delete({ where: { id: asset.id } }).catch(() => undefined);
      throw transactionError;
    }
    return kakaoJsonReply({ reply: `[K-LOL.GG 사진 접수 완료]\n접수번호: ${session.publicCode}\n사진: ${imageNumber}/${session.expectedImageCount ?? imageNumber}장${complete ? "\n필요한 사진이 모두 접수되어 관리자 검토 대기로 전환되었습니다." : ""}` });
  } catch (error) {
    logServerError("[KAKAO_IMAGE_RECEIVE_ERROR]", error);
    const message = error instanceof Error ? error.message : "사진 처리 중 오류가 발생했습니다.";
    return kakaoJsonReply({ reply: `[K-LOL.GG 사진 접수 실패]\n${message}` }, 500);
  }
}
