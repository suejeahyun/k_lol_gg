export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { kakaoJsonReply } from "@/lib/kakao/reply-format";
import { getKakaoOperationSettings } from "@/lib/kakao/settings";
import { isAuthorizedKakaoRequest, normalizeSessionKey } from "@/lib/kakao/request-auth";
import { deletePrivateAsset, storePrivateImage, validatePrivateImage } from "@/lib/storage/private-assets";
import { logServerError } from "@/lib/server/safe-log";
import { requireSiteFeature } from "@/lib/site/feature-guard";
import { currentDisciplineEvidenceCount } from "@/lib/discipline/evidence-batch";
import { evaluateKakaoRequestPolicy } from "@/lib/kakao/policy";

function cleanBase64(value: unknown) {
  const raw = String(value ?? "").trim();
  return raw.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, "").replace(/\s+/g, "");
}

function publicImageErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const safePrefixes = [
    "비어 있는 이미지는",
    "카카오 사진 한 장은",
    "PNG, JPG 또는 WebP",
    "파일 확장자와 실제 이미지",
    "이미지 크기가 올바르지",
  ];
  return safePrefixes.some((prefix) => message.startsWith(prefix))
    ? message
    : "사진 저장 중 오류가 발생했습니다. 관리자에게 문의해주세요.";
}

export async function POST(req: NextRequest) {
  try {
    const premiumLock = await requireSiteFeature("kakao");
    if (premiumLock) return premiumLock;
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    if (!isAuthorizedKakaoRequest(req, body.secret)) return kakaoJsonReply({ reply: "[K-LOL.GG 사진 접수 실패]\n인증값이 올바르지 않습니다." }, 401);
    const roomKey = normalizeSessionKey(String(body.roomName || body.room || ""));
    const senderKey = normalizeSessionKey(String(body.sender || ""));
    if (!roomKey || !senderKey) return kakaoJsonReply({ reply: "[K-LOL.GG 사진 접수 실패]\n방 이름과 보낸 사람 정보가 필요합니다." }, 400);
    const settings = await getKakaoOperationSettings();
    const generalPolicy = evaluateKakaoRequestPolicy(settings, {
      feature: "GENERAL",
      roomName: String(body.roomName || body.room || ""),
      sender: String(body.sender || ""),
      requireRoom: true,
      requireSender: true,
    });
    if (!generalPolicy.ok) return kakaoJsonReply({ reply: generalPolicy.message, policyReason: generalPolicy.reason }, generalPolicy.status);
    const publicCode = String(body.publicCode || "").trim().toUpperCase();
    const session = await prisma.kakaoImageReceiveSession.findFirst({
      where: publicCode
        ? { publicCode, roomKey, senderKey, status: "ACTIVE" }
        : { roomKey, senderKey, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
    });
    if (!session) return kakaoJsonReply({ reply: "[K-LOL.GG 사진 접수]\n현재 진행 중인 사진 접수가 없습니다. 먼저 접수번호로 사진 등록을 시작해주세요.", clearSession: true, sessionActive: false }, 404);
    if (session.expiresAt <= new Date()) {
      await prisma.kakaoImageReceiveSession.updateMany({ where: { id: session.id, status: "ACTIVE" }, data: { status: "EXPIRED" } });
      return kakaoJsonReply({ reply: "[K-LOL.GG 사진 접수]\n사진 접수 시간이 만료되었습니다. 접수번호로 다시 시작해주세요.", clearSession: true, sessionActive: false }, 410);
    }
    const imagePolicy = evaluateKakaoRequestPolicy(settings, {
      feature: session.purpose === "INHOUSE_RESULT" ? "INHOUSE_RESULT_IMAGE" : "DISCIPLINE_EVIDENCE",
      roomName: String(body.roomName || body.room || ""),
      sender: String(body.sender || ""),
      requireRoom: true,
      requireSender: true,
    });
    if (!imagePolicy.ok) return kakaoJsonReply({ reply: imagePolicy.message, policyReason: imagePolicy.reason }, imagePolicy.status);
    const encoded = cleanBase64(body.base64Image || body.imageBase64 || body.image);
    if (!encoded) return kakaoJsonReply({ reply: "[K-LOL.GG 사진 접수 실패]\n사진 데이터가 비어 있습니다." }, 400);
    const buffer = Buffer.from(encoded, "base64");
    const validated = await validatePrivateImage(buffer, typeof body.mimeType === "string" ? body.mimeType : null);
    const duplicate = await prisma.kakaoInboundImage.findFirst({ where: { sessionId: session.id, sha256: validated.sha256 } });
    if (duplicate) return kakaoJsonReply({ reply: `[K-LOL.GG 사진 접수]\n같은 사진이 이미 ${duplicate.imageNumber}번으로 접수되었습니다.` });
    const resolutionTask = session.purpose === "DISCIPLINE_RESOLUTION" ? await prisma.disciplineResolutionTask.findUnique({
      where: { id: session.targetId },
      include: { evidence: { select: { submittedAt: true } } },
    }) : null;
    if (session.purpose === "DISCIPLINE_RESOLUTION" && !resolutionTask) return kakaoJsonReply({ reply: "[K-LOL.GG 사진 접수 실패]\n경고 인증 과제를 찾을 수 없습니다." }, 404);
    if (resolutionTask?.dueAt && resolutionTask.dueAt <= new Date()) return kakaoJsonReply({ reply: "[K-LOL.GG 사진 접수 실패]\n경고 인증 기한이 지났습니다." }, 409);
    const priorResolutionDuplicate = session.purpose === "DISCIPLINE_RESOLUTION" ? await prisma.disciplineEvidence.findFirst({ where: { taskId: session.targetId, privateAsset: { sha256: validated.sha256 } }, select: { id: true } }) : null;
    if (priorResolutionDuplicate) return kakaoJsonReply({ reply: "[K-LOL.GG 사진 접수]\n이 경고 인증에 이미 제출한 사진입니다. 다른 게임 사진을 보내주세요." });
    const tentativeImageNumber = session.receivedImageCount + 1;
    if (session.expectedImageCount && tentativeImageNumber > session.expectedImageCount) return kakaoJsonReply({ reply: "[K-LOL.GG 사진 접수]\n필요한 사진이 모두 접수되었습니다." });
    const asset = await storePrivateImage({ buffer, purpose: session.purpose as "DISCIPLINE_ISSUE" | "DISCIPLINE_RESOLUTION" | "INHOUSE_RESULT", publicCode: session.publicCode, imageNumber: tentativeImageNumber, declaredMimeType: validated.mimeType });
    let result: { responseCode: string; progressText: string; completed: boolean };
    try {
      result = await prisma.$transaction(async (tx) => {
        if (session.purpose === "INHOUSE_RESULT") {
          await tx.$queryRaw`SELECT "id" FROM "InhouseResultSubmission" WHERE "id" = ${session.targetId} FOR UPDATE`;
        } else if (session.purpose === "DISCIPLINE_RESOLUTION") {
          await tx.$queryRaw`SELECT "id" FROM "DisciplineResolutionTask" WHERE "id" = ${session.targetId} FOR UPDATE`;
        } else if (session.purpose === "DISCIPLINE_ISSUE") {
          await tx.$queryRaw`SELECT "id" FROM "DisciplineSubmission" WHERE "id" = ${session.targetId} FOR UPDATE`;
        } else {
          throw new Error("UNSUPPORTED_IMAGE_PURPOSE");
        }
        await tx.$queryRaw`SELECT "id" FROM "KakaoImageReceiveSession" WHERE "id" = ${session.id} FOR UPDATE`;

        const currentSession = await tx.kakaoImageReceiveSession.findUnique({ where: { id: session.id } });
        if (!currentSession || currentSession.status !== "ACTIVE" || currentSession.expiresAt <= new Date()) {
          throw new Error("IMAGE_SESSION_NOT_ACTIVE");
        }
        if (currentSession.purpose !== session.purpose || currentSession.targetId !== session.targetId) {
          throw new Error("IMAGE_SESSION_CHANGED");
        }
        const existingImage = await tx.kakaoInboundImage.findFirst({
          where: { sessionId: currentSession.id, sha256: validated.sha256 },
          select: { imageNumber: true },
        });
        if (existingImage) throw new Error("IMAGE_ALREADY_RECEIVED");

        const imageNumber = currentSession.receivedImageCount + 1;
        if (currentSession.expectedImageCount && imageNumber > currentSession.expectedImageCount) {
          throw new Error("IMAGE_SESSION_COMPLETE");
        }

        let responseCode = currentSession.publicCode;
        let progressText = `${imageNumber}/${currentSession.expectedImageCount ?? imageNumber}`;
        let completed = !currentSession.expectedImageCount || imageNumber >= currentSession.expectedImageCount;

        if (currentSession.purpose === "INHOUSE_RESULT") {
          const submission = await tx.inhouseResultSubmission.findUnique({
            where: { id: currentSession.targetId },
            include: { images: { include: { privateAsset: { select: { sha256: true } } } } },
          });
          if (!submission || submission.matchSeriesId || submission.status !== "AWAITING_UPLOAD") {
            throw new Error("IMAGE_TARGET_NOT_UPLOADABLE");
          }
          if (submission.images.some((item) => item.privateAsset.sha256 === validated.sha256)) {
            throw new Error("IMAGE_ALREADY_RECEIVED");
          }
          const gameNumber = submission.images.length + 1;
          if (gameNumber > submission.expectedGameCount) throw new Error("IMAGE_SESSION_COMPLETE");
          await tx.inhouseResultImage.create({ data: { submissionId: submission.id, privateAssetId: asset.id, gameNumber } });
          completed = gameNumber >= submission.expectedGameCount;
          progressText = `${gameNumber}/${submission.expectedGameCount}`;
          if (completed) await tx.inhouseResultSubmission.update({ where: { id: submission.id }, data: { status: "PENDING_REVIEW" } });
        }

        if (currentSession.purpose === "DISCIPLINE_ISSUE") {
          const submission = await tx.disciplineSubmission.findUnique({ where: { id: currentSession.targetId } });
          if (!submission || submission.status !== "AWAITING_UPLOAD") throw new Error("IMAGE_TARGET_NOT_UPLOADABLE");
          if (completed) await tx.disciplineSubmission.update({ where: { id: submission.id }, data: { status: "PENDING_REVIEW" } });
        }

        if (currentSession.purpose === "DISCIPLINE_RESOLUTION") {
          const task = await tx.disciplineResolutionTask.findUnique({
            where: { id: currentSession.targetId },
            include: { evidence: { include: { privateAsset: { select: { sha256: true } } } } },
          });
          if (!task || !["REQUIRED", "REJECTED", "AWAITING_UPLOAD"].includes(task.status)) {
            throw new Error("IMAGE_TARGET_NOT_UPLOADABLE");
          }
          if (task.dueAt <= new Date()) throw new Error("IMAGE_TASK_EXPIRED");
          if (task.evidence.some((item) => item.privateAsset.sha256 === validated.sha256)) {
            throw new Error("IMAGE_ALREADY_RECEIVED");
          }
          const resolutionTotal = currentDisciplineEvidenceCount(task.evidence, task.reviewedAt) + 1;
          if (resolutionTotal > task.requiredGameCount) throw new Error("IMAGE_SESSION_COMPLETE");
          await tx.disciplineEvidence.create({ data: { taskId: task.id, privateAssetId: asset.id, claimedGameCount: 1 } });
          completed = resolutionTotal >= task.requiredGameCount;
          responseCode = task.publicCode;
          progressText = `${resolutionTotal}/${task.requiredGameCount}`;
          await tx.disciplineResolutionTask.update({
            where: { id: task.id },
            data: {
              claimedGameCount: resolutionTotal,
              status: completed ? "PENDING_REVIEW" : "AWAITING_UPLOAD",
              submittedAt: completed ? new Date() : null,
            },
          });
        }

        await tx.kakaoInboundImage.create({ data: { sessionId: currentSession.id, privateAssetId: asset.id, imageNumber, sourceEventKey: typeof body.sourceEventKey === "string" ? body.sourceEventKey : null, sha256: validated.sha256 } });
        await tx.kakaoImageReceiveSession.update({
          where: { id: currentSession.id },
          data: { receivedImageCount: imageNumber, status: completed ? "COMPLETE" : "ACTIVE" },
        });
        return { responseCode, progressText, completed };
      });
    } catch (transactionError) {
      await deletePrivateAsset(asset.storageKey).catch(() => undefined);
      await prisma.privateAsset.delete({ where: { id: asset.id } }).catch(() => undefined);
      if (transactionError instanceof Error && transactionError.message === "IMAGE_ALREADY_RECEIVED") {
        return kakaoJsonReply({ reply: "[K-LOL.GG 사진 접수]\n같은 사진이 이미 접수되었습니다." });
      }
      if (transactionError instanceof Error && transactionError.message === "IMAGE_SESSION_COMPLETE") {
        return kakaoJsonReply({ reply: "[K-LOL.GG 사진 접수]\n필요한 사진이 모두 접수되었습니다." });
      }
      if (transactionError instanceof Error && ["IMAGE_SESSION_NOT_ACTIVE", "IMAGE_SESSION_CHANGED"].includes(transactionError.message)) {
        return kakaoJsonReply({ reply: "[K-LOL.GG 사진 접수]\n진행 중인 사진 접수가 없거나 접수 시간이 만료되었습니다.", clearSession: true, sessionActive: false }, 404);
      }
      if (transactionError instanceof Error && transactionError.message === "IMAGE_TASK_EXPIRED") {
        return kakaoJsonReply({ reply: "[K-LOL.GG 사진 접수 실패]\n경고 인증 기한이 지났습니다." }, 409);
      }
      if (transactionError instanceof Error && transactionError.message === "IMAGE_TARGET_NOT_UPLOADABLE") {
        return kakaoJsonReply({ reply: "[K-LOL.GG 사진 접수 실패]\n접수 상태가 변경되어 현재 사진을 받을 수 없습니다." }, 409);
      }
      throw transactionError;
    }
    return kakaoJsonReply({
      reply: `[K-LOL.GG 사진 접수 완료]\n접수번호: ${result.responseCode}\n사진: ${result.progressText}장${result.completed ? "\n필요한 사진이 모두 접수되어 관리자 검토 대기로 전환되었습니다." : ""}`,
      publicCode: result.responseCode,
      completed: result.completed,
      clearSession: result.completed,
      sessionActive: !result.completed,
    });
  } catch (error) {
    logServerError("[KAKAO_IMAGE_RECEIVE_ERROR]", error);
    return kakaoJsonReply({ reply: `[K-LOL.GG 사진 접수 실패]\n${publicImageErrorMessage(error)}` }, 500);
  }
}
