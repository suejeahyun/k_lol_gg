export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { kakaoJsonReply } from "@/lib/kakao/reply-format";
import { getKakaoOperationSettings } from "@/lib/kakao/settings";
import {
  getPublishedManagedTemplate,
  makePublicCode,
  makeSourceMessageHash,
  managedTemplateSnapshot,
  parseKstDateOnly,
  parseManagedForm,
  parseNicknameTag,
  renderManagedTemplate,
  unsupportedManagedRequiredFields,
} from "@/lib/kakao/managed-forms";
import { isAuthorizedKakaoRequest, normalizeSessionKey } from "@/lib/kakao/request-auth";
import { normalizeKakaoRequestId } from "@/lib/kakao/request-id";
import { parseManagedQuickCommand } from "@/lib/kakao/managed-quick-command";
import { logServerError } from "@/lib/server/safe-log";
import { getKstDateKey } from "@/lib/date/kst";
import { requireSiteFeature } from "@/lib/site/feature-guard";
import { getPublicBaseUrl } from "@/lib/http/base-url";
import { currentDisciplineEvidenceCount } from "@/lib/discipline/evidence-batch";
import {
  canAccessKakaoOwnedResource,
  evaluateKakaoRequestPolicy,
  isKakaoOperatorSender,
  type KakaoPolicyFeature,
} from "@/lib/kakao/policy";
import type { KakaoOperationSettings } from "@/lib/kakao/settings";

function text(value: unknown) {
  return String(value ?? "").trim();
}

function canonicalManagedCommand(value: string) {
  const message = value.trim();
  const evidence = message.match(/^\/?(?:경고인증|인증)\s+(WR[A-F0-9]{10})$/i);
  if (evidence) return `/경고인증 ${evidence[1].toUpperCase()}`;
  if (/^\/?(?:경고인증|인증)$/.test(message)) return "/경고인증";
  const disciplineStatus = message.match(/^\/?경고현황\s+((?:DS|WR)[A-F0-9]{10})$/i);
  if (disciplineStatus) return `/경고현황 ${disciplineStatus[1].toUpperCase()}`;
  if (/^\/?경고현황$/.test(message)) return "/경고현황";
  const resultStatus = message.match(/^\/?(?:내전등록현황|결과현황)\s+(MR[A-F0-9]{10})$/i);
  if (resultStatus) return `/내전등록현황 ${resultStatus[1].toUpperCase()}`;
  if (/^\/?(?:내전등록현황|결과현황)$/.test(message)) return "/내전등록현황";
  if (/^\/?(?:내전결과|결과등록)$/.test(message)) return "/내전등록";
  if (/^\/?사진취소$/.test(message)) return "/사진취소";
  return message;
}

function policyReply(
  settings: KakaoOperationSettings,
  feature: KakaoPolicyFeature,
  roomName: string,
  sender: string,
) {
  const policy = evaluateKakaoRequestPolicy(settings, {
    feature,
    roomName,
    sender,
    requireRoom: true,
    requireSender: true,
  });
  if (policy.ok) return null;
  return kakaoJsonReply(
    { reply: policy.message, ignored: policy.reason === "BOT_SENDER", policyReason: policy.reason },
    policy.status,
  );
}

function normalizePersonText(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("ko-KR")
    .replace(/[\[\](){}]/g, " ")
    .replace(/\s+/g, " ");
}

function senderMatchesDisciplineTarget(
  sender: string,
  record: {
    targetName: string;
    targetNickname: string | null;
    targetTag: string | null;
    userAccount: { userId: string } | null;
    player: { name: string; nickname: string; tag: string } | null;
  },
) {
  const senderText = normalizePersonText(sender);
  const candidates = [
    record.targetName,
    record.targetNickname,
    record.targetNickname && record.targetTag ? `${record.targetNickname}#${record.targetTag}` : null,
    record.userAccount?.userId,
    record.player?.name,
    record.player?.nickname,
    record.player ? `${record.player.nickname}#${record.player.tag}` : null,
  ]
    .map(normalizePersonText)
    .filter((item) => item.length >= 2);

  return candidates.some((candidate) =>
    senderText === candidate || senderText.split(" ").includes(candidate),
  );
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    REQUIRED: "사진 제출 필요",
    AWAITING_UPLOAD: "사진 업로드 대기",
    PENDING_REVIEW: "관리자 검토 대기",
    IN_REVIEW: "관리자 검토 중",
    APPROVED: "승인 완료",
    REGISTERED: "내전 등록 완료",
    REJECTED: "반려",
  };
  return labels[status] || status;
}

async function statusReply(
  message: string,
  settings: KakaoOperationSettings,
  roomName: string,
  sender: string,
) {
  const [command, code] = message.split(/\s+/, 2);
  if (!code) return null;
  if (command === "/경고현황") {
    const submission = await prisma.disciplineSubmission.findUnique({ where: { publicCode: code.toUpperCase() } });
    const task = await prisma.disciplineResolutionTask.findUnique({
      where: { publicCode: code.toUpperCase() },
      include: {
        evidence: { select: { submittedAt: true } },
        disciplineRecord: {
          select: {
            targetName: true,
            targetNickname: true,
            targetTag: true,
            userAccount: { select: { userId: true } },
            player: { select: { name: true, nickname: true, tag: true } },
          },
        },
      },
    });
    if (submission) {
      const canView = canAccessKakaoOwnedResource(settings, {
        resourceRoomName: submission.roomName,
        resourceSender: submission.sender,
        roomName,
        sender,
      });
      return canView
        ? `[K-LOL.GG 경고 접수 현황]\n접수번호: ${submission.publicCode}\n상태: ${statusLabel(submission.status)}`
        : "[K-LOL.GG 경고 현황]\n접수번호를 찾을 수 없거나 확인 권한이 없습니다.";
    }
    if (task) {
      if (!isKakaoOperatorSender(settings, sender) && !senderMatchesDisciplineTarget(sender, task.disciplineRecord)) {
        return "[K-LOL.GG 경고 현황]\n접수번호를 찾을 수 없거나 확인 권한이 없습니다.";
      }
      const receivedCount = task.status === "APPROVED"
        ? task.requiredGameCount
        : currentDisciplineEvidenceCount(task.evidence, task.reviewedAt);
      const canUpload = ["REQUIRED", "REJECTED", "AWAITING_UPLOAD"].includes(task.status)
        && receivedCount < task.requiredGameCount
        && task.dueAt > new Date();
      return `[K-LOL.GG 경고 차감 현황]\n인증번호: ${task.publicCode}\n상태: ${statusLabel(task.status)}\n인증 사진: ${receivedCount}/${task.requiredGameCount}장\n필요 판수: ${task.requiredGameCount}판\n기한: ${getKstDateKey(task.dueAt)}${canUpload ? `\n사이트 일괄 제출: ${getPublicBaseUrl()}/discipline/evidence?code=${task.publicCode}` : ""}`;
    }
    return "[K-LOL.GG 경고 현황]\n접수번호를 찾을 수 없습니다.";
  }
  if (command === "/내전등록현황" || (command === "/내전현황" && /^MR[A-F0-9]{10}$/i.test(code))) {
    const item = await prisma.inhouseResultSubmission.findUnique({
      where: { publicCode: code.toUpperCase() },
      include: { _count: { select: { images: true } } },
    });
    if (item && !canAccessKakaoOwnedResource(settings, {
      resourceRoomName: item.roomName,
      resourceSender: item.sender,
      roomName,
      sender,
    })) {
      return "[K-LOL.GG 내전 결과 현황]\n접수번호를 찾을 수 없거나 확인 권한이 없습니다.";
    }
    return item
      ? `[K-LOL.GG 내전 결과 현황]\n접수번호: ${item.publicCode}\n상태: ${statusLabel(item.status)}\n사진: ${item._count.images}/${item.expectedGameCount}장${item.status === "AWAITING_UPLOAD" ? `\n관리자 사이트 사진 복구: ${getPublicBaseUrl()}/matches/submit?code=${item.publicCode}` : ""}`
      : "[K-LOL.GG 내전 결과 현황]\n접수번호를 찾을 수 없습니다.";
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const premiumLock = await requireSiteFeature("kakao");
    if (premiumLock) return premiumLock;
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    if (!isAuthorizedKakaoRequest(req, body.secret)) return kakaoJsonReply({ reply: "[K-LOL.GG]\n인증값이 올바르지 않습니다." }, 401);
    const rawMessage = text(body.message || body.text);
    let message = canonicalManagedCommand(rawMessage);
    const requestId = normalizeKakaoRequestId(body.requestId);
    const roomName = text(body.roomName || body.room);
    const sender = text(body.sender);
    if (!roomName || !sender) return kakaoJsonReply({ reply: "[K-LOL.GG]\n방 이름과 보낸 사람 정보가 필요합니다." }, 400);
    const settings = await getKakaoOperationSettings();
    const generalPolicyRejected = policyReply(settings, "GENERAL", roomName, sender);
    if (generalPolicyRejected) return generalPolicyRejected;

    if (message === "/사진취소" || message === "사진취소") {
      const cancelled = await prisma.kakaoImageReceiveSession.updateMany({
        where: {
          roomKey: normalizeSessionKey(roomName),
          senderKey: normalizeSessionKey(sender),
          status: "ACTIVE",
        },
        data: { status: "CANCELLED" },
      });
      return kakaoJsonReply({
        reply: cancelled.count > 0
          ? "[K-LOL.GG 사진 접수]\n진행 중인 사진 접수를 취소했습니다."
          : "[K-LOL.GG 사진 접수]\n취소할 사진 접수가 없습니다.",
        clearSession: true,
        sessionActive: false,
      });
    }

    if (message === "/경고인증") {
      const evidencePolicyRejected = policyReply(settings, "DISCIPLINE_EVIDENCE", roomName, sender);
      if (evidencePolicyRejected) return evidencePolicyRejected;

      const activeSession = await prisma.kakaoImageReceiveSession.findFirst({
        where: {
          roomKey: normalizeSessionKey(roomName),
          senderKey: normalizeSessionKey(sender),
          purpose: "DISCIPLINE_RESOLUTION",
          targetType: "DisciplineResolutionTask",
          status: "ACTIVE",
          expiresAt: { gt: new Date() },
        },
        orderBy: { updatedAt: "desc" },
        select: { targetId: true },
      });
      const sessionTask = activeSession ? await prisma.disciplineResolutionTask.findUnique({
        where: { id: activeSession.targetId },
        select: { id: true, publicCode: true, status: true, dueAt: true },
      }) : null;
      const activeSessionTask = sessionTask
        && ["REQUIRED", "REJECTED", "AWAITING_UPLOAD"].includes(sessionTask.status)
        && sessionTask.dueAt > new Date()
        ? sessionTask
        : null;

      let selectedCode = activeSessionTask?.publicCode ?? "";
      if (!selectedCode) {
        const availableTasks = await prisma.disciplineResolutionTask.findMany({
          where: {
            status: { in: ["REQUIRED", "REJECTED", "AWAITING_UPLOAD"] },
            dueAt: { gt: new Date() },
          },
          include: {
            disciplineRecord: {
              select: {
                targetName: true,
                targetNickname: true,
                targetTag: true,
                userAccount: { select: { userId: true } },
                player: { select: { name: true, nickname: true, tag: true } },
              },
            },
          },
          orderBy: { dueAt: "asc" },
          take: 100,
        });
        const ownedTasks = availableTasks.filter((task) => senderMatchesDisciplineTarget(sender, task.disciplineRecord));
        if (ownedTasks.length !== 1) {
          return kakaoJsonReply({
            reply: ownedTasks.length === 0
              ? `[K-LOL.GG 경고 인증]\n현재 카카오 이름으로 자동 선택할 수 있는 사진 과제가 없습니다.\n로그인 후 내정보에서 확인해주세요.\n${getPublicBaseUrl()}/account`
              : `[K-LOL.GG 경고 인증]\n본인 사진 과제가 여러 건이라 자동 선택하지 않았습니다.\n/인증 WR접수번호를 입력하거나 로그인 후 내정보에서 선택해주세요.\n${getPublicBaseUrl()}/account`,
            policyReason: ownedTasks.length === 0 ? "NO_OWNED_TASK" : "AMBIGUOUS_OWNED_TASK",
          }, 409);
        }
        selectedCode = ownedTasks[0].publicCode;
      }
      message = `/경고인증 ${selectedCode}`;
    }

    if (message === "/경고현황") {
      const statusPolicyRejected = policyReply(settings, "DISCIPLINE_STATUS", roomName, sender);
      if (statusPolicyRejected) return statusPolicyRejected;
      const [ownedSubmissions, candidateTasks] = await Promise.all([
        prisma.disciplineSubmission.findMany({
          where: {
            roomName,
            sender,
            status: { in: ["AWAITING_UPLOAD", "PENDING_REVIEW", "IN_REVIEW", "REJECTED"] },
          },
          orderBy: { createdAt: "desc" },
          take: 3,
          select: { publicCode: true },
        }),
        prisma.disciplineResolutionTask.findMany({
          where: { status: { in: ["REQUIRED", "REJECTED", "AWAITING_UPLOAD", "PENDING_REVIEW", "IN_REVIEW"] } },
          include: {
            disciplineRecord: {
              select: {
                targetName: true,
                targetNickname: true,
                targetTag: true,
                userAccount: { select: { userId: true } },
                player: { select: { name: true, nickname: true, tag: true } },
              },
            },
          },
          orderBy: { updatedAt: "desc" },
          take: 100,
        }),
      ]);
      const ownedTaskCodes = candidateTasks
        .filter((task) => senderMatchesDisciplineTarget(sender, task.disciplineRecord))
        .map((task) => task.publicCode);
      const ownedCodes = [...new Set([...ownedSubmissions.map((item) => item.publicCode), ...ownedTaskCodes])];
      if (ownedCodes.length !== 1) {
        return kakaoJsonReply({
          reply: ownedCodes.length === 0
            ? `[K-LOL.GG 경고 현황]\n현재 카카오 이름으로 자동 선택할 진행 건이 없습니다.\n${getPublicBaseUrl()}/account`
            : `[K-LOL.GG 경고 현황]\n진행 건이 여러 건이라 자동 선택하지 않았습니다.\n/경고현황 DS또는WR접수번호를 입력하거나 내정보에서 확인해주세요.\n${getPublicBaseUrl()}/account`,
          policyReason: ownedCodes.length === 0 ? "NO_OWNED_STATUS" : "AMBIGUOUS_OWNED_STATUS",
        }, 409);
      }
      message = `/경고현황 ${ownedCodes[0]}`;
    }

    if (message === "/내전등록현황") {
      const statusPolicyRejected = policyReply(settings, "INHOUSE_RESULT_FORM", roomName, sender);
      if (statusPolicyRejected) return statusPolicyRejected;
      const ownedResults = await prisma.inhouseResultSubmission.findMany({
        where: {
          roomName,
          sender,
          status: { in: ["AWAITING_UPLOAD", "PENDING_REVIEW", "IN_REVIEW", "REJECTED"] },
        },
        orderBy: { createdAt: "desc" },
        take: 3,
        select: { publicCode: true },
      });
      if (ownedResults.length !== 1) {
        return kakaoJsonReply({
          reply: ownedResults.length === 0
            ? "[K-LOL.GG 내전 결과 현황]\n이 방에서 본인이 접수한 진행 건이 없습니다."
            : "[K-LOL.GG 내전 결과 현황]\n진행 건이 여러 건이라 자동 선택하지 않았습니다.\n/결과현황 MR접수번호를 입력해주세요.",
          policyReason: ownedResults.length === 0 ? "NO_OWNED_STATUS" : "AMBIGUOUS_OWNED_STATUS",
        }, 409);
      }
      message = `/내전등록현황 ${ownedResults[0].publicCode}`;
    }

    if (message.startsWith("/경고인증 ")) {
      const evidencePolicyRejected = policyReply(settings, "DISCIPLINE_EVIDENCE", roomName, sender);
      if (evidencePolicyRejected) return evidencePolicyRejected;
      const code = message.split(/\s+/, 2)[1]?.toUpperCase();
      const task = code ? await prisma.disciplineResolutionTask.findUnique({
        where: { publicCode: code },
        include: {
          evidence: { select: { submittedAt: true } },
          disciplineRecord: {
            select: {
              targetName: true,
              targetNickname: true,
              targetTag: true,
              userAccount: { select: { userId: true } },
              player: { select: { name: true, nickname: true, tag: true } },
            },
          },
        },
      }) : null;
      if (!task || !["REQUIRED", "REJECTED", "AWAITING_UPLOAD"].includes(task.status)) return kakaoJsonReply({ reply: "[K-LOL.GG 경고 인증 실패]\n인증번호가 없거나 현재 사진을 받을 수 없는 상태입니다." }, 404);
      if (!isKakaoOperatorSender(settings, sender) && !senderMatchesDisciplineTarget(sender, task.disciplineRecord)) {
        return kakaoJsonReply({
          reply: `[K-LOL.GG 경고 인증 실패]\n이 인증번호의 대상자 이름과 현재 카카오 이름이 일치하지 않습니다.\n본인 계정으로 로그인한 뒤 사이트에서 제출해주세요.\n${getPublicBaseUrl()}/discipline/evidence?code=${task.publicCode}`,
          policyReason: "DISCIPLINE_TARGET_MISMATCH",
        }, 403);
      }
      if (task.dueAt <= new Date()) return kakaoJsonReply({ reply: `[K-LOL.GG 경고 인증 실패]\n인증 기한(${getKstDateKey(task.dueAt)})이 지났습니다. 관리자에게 문의해주세요.` }, 409);
      let startResult: { publicCode: string; receivedImageCount: number; requiredGameCount: number; remainingImageCount: number };
      try {
        startResult = await prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT "id" FROM "DisciplineResolutionTask" WHERE "id" = ${task.id} FOR UPDATE`;
          const current = await tx.disciplineResolutionTask.findUnique({
            where: { id: task.id },
            include: { evidence: { select: { submittedAt: true } } },
          });
          if (!current || !["REQUIRED", "REJECTED", "AWAITING_UPLOAD"].includes(current.status)) {
            throw new Error("DISCIPLINE_TASK_NOT_UPLOADABLE");
          }
          if (current.dueAt <= new Date()) throw new Error("DISCIPLINE_TASK_EXPIRED");
          const receivedImageCount = currentDisciplineEvidenceCount(current.evidence, current.reviewedAt);
          const remainingImageCount = Math.max(0, current.requiredGameCount - receivedImageCount);
          if (remainingImageCount === 0) {
            await tx.disciplineResolutionTask.update({ where: { id: current.id }, data: { status: "PENDING_REVIEW", submittedAt: new Date(), claimedGameCount: current.requiredGameCount } });
            return { publicCode: current.publicCode, receivedImageCount, requiredGameCount: current.requiredGameCount, remainingImageCount };
          }
          await tx.kakaoImageReceiveSession.updateMany({ where: { roomKey: normalizeSessionKey(roomName), senderKey: normalizeSessionKey(sender), status: "ACTIVE" }, data: { status: "CANCELLED" } });
          await tx.kakaoImageReceiveSession.create({ data: { publicCode: makePublicCode("EV"), purpose: "DISCIPLINE_RESOLUTION", targetType: "DisciplineResolutionTask", targetId: current.id, roomKey: normalizeSessionKey(roomName), senderKey: normalizeSessionKey(sender), expectedImageCount: remainingImageCount, expiresAt: new Date(Date.now() + 30 * 60 * 1000) } });
          await tx.disciplineResolutionTask.update({ where: { id: current.id }, data: { status: "AWAITING_UPLOAD", claimedGameCount: receivedImageCount } });
          return { publicCode: current.publicCode, receivedImageCount, requiredGameCount: current.requiredGameCount, remainingImageCount };
        });
      } catch (startError) {
        if (startError instanceof Error && startError.message === "DISCIPLINE_TASK_EXPIRED") {
          return kakaoJsonReply({ reply: `[K-LOL.GG 경고 인증 실패]\n인증 기한(${getKstDateKey(task.dueAt)})이 지났습니다. 관리자에게 문의해주세요.` }, 409);
        }
        if (startError instanceof Error && startError.message === "DISCIPLINE_TASK_NOT_UPLOADABLE") {
          return kakaoJsonReply({ reply: "[K-LOL.GG 경고 인증 실패]\n과제 상태가 변경되어 현재 사진을 받을 수 없습니다." }, 409);
        }
        throw startError;
      }
      if (startResult.remainingImageCount === 0) {
        return kakaoJsonReply({
          reply: `[K-LOL.GG 경고 인증]\n인증번호: ${startResult.publicCode}\n사진 ${startResult.requiredGameCount}/${startResult.requiredGameCount}장이 모두 접수되어 관리자 검토 대기 중입니다.`,
          clearSession: true,
          sessionActive: false,
        });
      }
      return kakaoJsonReply({
        reply: `[K-LOL.GG 경고 인증 시작]\n인증번호: ${startResult.publicCode}\n현재: ${startResult.receivedImageCount}/${startResult.requiredGameCount}장\n남은 사진: ${startResult.remainingImageCount}장\n카카오로 한 장씩 보내거나 사이트에서 남은 사진을 한 번에 제출할 수 있습니다.\n${getPublicBaseUrl()}/discipline/evidence?code=${startResult.publicCode}`,
        publicCode: startResult.publicCode,
        sessionActive: true,
      });
    }

    if (message.startsWith("/경고인증완료 ")) {
      return kakaoJsonReply({ reply: "[K-LOL.GG 경고 인증]\n일반은 10장, 내전은 15장이 모두 접수되면 자동으로 관리자 검토 대기로 전환됩니다. /경고현황 인증번호 로 확인해주세요." });
    }

    if (message.startsWith("/경고현황 ")) {
      const statusPolicyRejected = policyReply(settings, "DISCIPLINE_STATUS", roomName, sender);
      if (statusPolicyRejected) return statusPolicyRejected;
    }
    if (message.startsWith("/내전등록현황 ") || /^\/내전현황\s+MR[A-F0-9]{10}$/i.test(message)) {
      const statusPolicyRejected = policyReply(settings, "INHOUSE_RESULT_FORM", roomName, sender);
      if (statusPolicyRejected) return statusPolicyRejected;
    }
    const currentStatus = await statusReply(message, settings, roomName, sender);
    if (currentStatus) return kakaoJsonReply({ reply: currentStatus });

    const [disciplineTemplate, inhouseTemplate] = await Promise.all([
      getPublishedManagedTemplate("DISCIPLINE"),
      getPublishedManagedTemplate("INHOUSE_RESULT"),
    ]);
    let sourceHashInput = message;
    const quickCommand = parseManagedQuickCommand(message);
    if (quickCommand.matched) {
      const quickKind = quickCommand.ok ? quickCommand.command.kind : quickCommand.kind;
      const quickFeature = quickKind === "DISCIPLINE" ? "DISCIPLINE_FORM" : "INHOUSE_RESULT_FORM";
      const quickPolicyRejected = policyReply(settings, quickFeature, roomName, sender);
      if (quickPolicyRejected) return quickPolicyRejected;
      if (quickKind === "DISCIPLINE" && !isKakaoOperatorSender(settings, sender)) {
        return kakaoJsonReply({
          reply: "[K-LOL.GG 경고 접수]\n등록된 카카오 운영자만 경고를 접수할 수 있습니다.",
          policyReason: "OPERATOR_REQUIRED",
        }, 403);
      }
      if (!quickCommand.ok) return kakaoJsonReply({ reply: `[K-LOL.GG 빠른 접수]\n${quickCommand.message}` }, 400);

      sourceHashInput = requestId ? `${requestId}\n${rawMessage}` : rawMessage;
      if (quickCommand.command.kind === "DISCIPLINE") {
        const unsupported = unsupportedManagedRequiredFields(disciplineTemplate, [
          "targetName",
          "targetNicknameTag",
          "warningCategory",
          "issuedDate",
          "evidenceImageCount",
        ]);
        if (unsupported.length > 0) {
          return kakaoJsonReply({
            reply: `[K-LOL.GG 경고 빠른 접수]\n관리자가 추가한 필수 항목(${unsupported.map((field) => field.label).join(", ")})이 있어 /경고 양식을 이용해주세요.`,
          }, 409);
        }
        const player = await prisma.player.findFirst({
          where: {
            nickname: { equals: quickCommand.command.nickname, mode: "insensitive" },
            tag: { equals: quickCommand.command.tag, mode: "insensitive" },
          },
          orderBy: { id: "asc" },
          select: { name: true, nickname: true, tag: true },
        });
        if (!player) {
          return kakaoJsonReply({
            reply: "[K-LOL.GG 경고 빠른 접수]\n등록된 플레이어의 닉네임#태그를 찾지 못했습니다.\n/경고 양식으로 대상 이름을 직접 확인해주세요.",
          }, 404);
        }
        message = renderManagedTemplate(disciplineTemplate, {
          targetName: player.name,
          targetNicknameTag: `${player.nickname}#${player.tag}`,
          warningCategory: quickCommand.command.category === "INHOUSE" ? "내전" : "일반",
          issuedDate: getKstDateKey(new Date()),
          evidenceImageCount: String(quickCommand.command.evidenceCount),
        });
      } else {
        const unsupported = unsupportedManagedRequiredFields(inhouseTemplate, [
          "matchDate",
          "organizer",
          "gameCount",
          "seriesNumber",
          "teamBalanceDraftId",
          "note",
        ]);
        if (unsupported.length > 0) {
          return kakaoJsonReply({
            reply: `[K-LOL.GG 내전 결과 빠른 접수]\n관리자가 추가한 필수 항목(${unsupported.map((field) => field.label).join(", ")})이 있어 /내전등록 양식을 이용해주세요.`,
          }, 409);
        }
        message = renderManagedTemplate(inhouseTemplate, {
          matchDate: getKstDateKey(new Date()),
          organizer: sender,
          gameCount: String(quickCommand.command.gameCount),
          seriesNumber: String(quickCommand.command.seriesNumber),
          ...(quickCommand.command.teamBalanceDraftId
            ? { teamBalanceDraftId: String(quickCommand.command.teamBalanceDraftId) }
            : {}),
          note: quickCommand.command.note,
        });
      }
    }

    if (disciplineTemplate.commandAliases.includes(message)) {
      const disciplinePolicyRejected = policyReply(settings, "DISCIPLINE_FORM", roomName, sender);
      if (disciplinePolicyRejected) return disciplinePolicyRejected;
      if (!isKakaoOperatorSender(settings, sender)) return kakaoJsonReply({ reply: "[K-LOL.GG 경고 양식]\n등록된 카카오 운영자만 경고 양식을 호출할 수 있습니다.", policyReason: "OPERATOR_REQUIRED" }, 403);
      return kakaoJsonReply({
        reply: renderManagedTemplate(disciplineTemplate, {
          issuedDate: getKstDateKey(new Date()),
          evidenceImageCount: "0",
        }),
        formType: "DISCIPLINE",
      });
    }
    if (inhouseTemplate.commandAliases.includes(message)) {
      const inhousePolicyRejected = policyReply(settings, "INHOUSE_RESULT_FORM", roomName, sender);
      if (inhousePolicyRejected) return inhousePolicyRejected;
      return kakaoJsonReply({
        reply: renderManagedTemplate(inhouseTemplate, {
          matchDate: getKstDateKey(new Date()),
          organizer: sender,
          note: "없음",
        }),
        formType: "INHOUSE_RESULT",
      });
    }

    if (message.includes(`[${disciplineTemplate.title} v${disciplineTemplate.version}]`)) {
      const disciplinePolicyRejected = policyReply(settings, "DISCIPLINE_FORM", roomName, sender);
      if (disciplinePolicyRejected) return disciplinePolicyRejected;
      if (!isKakaoOperatorSender(settings, sender)) return kakaoJsonReply({ reply: "[K-LOL.GG 경고 접수 실패]\n등록된 카카오 운영자만 경고를 접수할 수 있습니다.", policyReason: "OPERATOR_REQUIRED" }, 403);
      const parsed = parseManagedForm(message, disciplineTemplate);
      if (!parsed.ok) return kakaoJsonReply({ reply: `[K-LOL.GG 경고 접수 실패]\n${parsed.message}` }, 400);
      const nicknameTag = parseNicknameTag(parsed.values.targetNicknameTag);
      const issuedAt = parseKstDateOnly(parsed.values.issuedDate);
      const category = parsed.values.warningCategory === "내전" ? "INHOUSE" : parsed.values.warningCategory === "일반" ? "GENERAL" : null;
      const evidenceCount = Number(parsed.values.evidenceImageCount);
      if (!nicknameTag || !issuedAt || !category || !Number.isInteger(evidenceCount) || evidenceCount < 0 || evidenceCount > 3) {
        return kakaoJsonReply({ reply: "[K-LOL.GG 경고 접수 실패]\n닉네임#태그, 구분, 날짜 또는 경고 부여 근거 사진 수(0~3)를 확인해주세요." }, 400);
      }
      const hash = makeSourceMessageHash("DISCIPLINE", roomName, sender, sourceHashInput);
      const duplicate = await prisma.disciplineSubmission.findUnique({ where: { sourceMessageHash: hash } });
      if (duplicate) {
        const resume = await prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT "id" FROM "DisciplineSubmission" WHERE "id" = ${duplicate.id} FOR UPDATE`;
          const [current, existingSession] = await Promise.all([
            tx.disciplineSubmission.findUnique({ where: { id: duplicate.id } }),
            tx.kakaoImageReceiveSession.findUnique({
              where: { publicCode: duplicate.publicCode },
              include: { _count: { select: { images: true } } },
            }),
          ]);
          if (!current) throw new Error("DISCIPLINE_SUBMISSION_NOT_FOUND");
          const receivedCount = existingSession?._count.images ?? 0;
          const remainingCount = Math.max(0, evidenceCount - receivedCount);
          if (current.status === "AWAITING_UPLOAD" && remainingCount > 0) {
            await tx.kakaoImageReceiveSession.updateMany({
              where: {
                roomKey: normalizeSessionKey(roomName),
                senderKey: normalizeSessionKey(sender),
                status: "ACTIVE",
                NOT: { publicCode: duplicate.publicCode },
              },
              data: { status: "CANCELLED" },
            });
            await tx.kakaoImageReceiveSession.upsert({
              where: { publicCode: duplicate.publicCode },
              create: {
                publicCode: duplicate.publicCode,
                purpose: "DISCIPLINE_ISSUE",
                targetType: "DisciplineSubmission",
                targetId: duplicate.id,
                roomKey: normalizeSessionKey(roomName),
                senderKey: normalizeSessionKey(sender),
                expectedImageCount: evidenceCount,
                receivedImageCount: receivedCount,
                expiresAt: new Date(Date.now() + 30 * 60 * 1000),
              },
              update: {
                roomKey: normalizeSessionKey(roomName),
                senderKey: normalizeSessionKey(sender),
                expectedImageCount: evidenceCount,
                receivedImageCount: receivedCount,
                status: "ACTIVE",
                expiresAt: new Date(Date.now() + 30 * 60 * 1000),
              },
            });
          }
          return { status: current.status, receivedCount, remainingCount, resumed: current.status === "AWAITING_UPLOAD" && remainingCount > 0 };
        });
        if (resume.resumed) {
          return kakaoJsonReply({
            reply: `[K-LOL.GG 경고 사진 접수 재개]\n접수번호: ${duplicate.publicCode}\n현재: ${resume.receivedCount}/${evidenceCount}장\n남은 사진 ${resume.remainingCount}장을 30분 안에 보내주세요.`,
            publicCode: duplicate.publicCode,
            sessionActive: true,
          });
        }
        return kakaoJsonReply({
          reply: `[K-LOL.GG 경고 접수 완료]\n이미 접수된 양식입니다.\n접수번호: ${duplicate.publicCode}\n상태: ${statusLabel(resume.status)}`,
          publicCode: duplicate.publicCode,
          clearSession: true,
          sessionActive: false,
        });
      }
      const player = await prisma.player.findFirst({
        where: { nickname: { equals: nicknameTag.nickname, mode: "insensitive" }, tag: { equals: nicknameTag.tag, mode: "insensitive" } },
        select: { id: true, userAccountId: true },
      });
      const publicCode = makePublicCode("DS");
      const submission = await prisma.$transaction(async (tx) => {
        const created = await tx.disciplineSubmission.create({
          data: {
            publicCode,
            templateId: disciplineTemplate.id,
            templateVersion: disciplineTemplate.version,
            templateSnapshot: managedTemplateSnapshot(disciplineTemplate),
            rawText: message,
            parsedData: { ...parsed.values, nickname: nicknameTag.nickname, tag: nicknameTag.tag, category, issuedAt: issuedAt.toISOString(), evidenceCount },
            roomName: roomName || null,
            sender: sender || null,
            sourceMessageHash: hash,
            targetPlayerId: player?.id ?? null,
            targetUserAccountId: player?.userAccountId ?? null,
            status: evidenceCount > 0 ? "AWAITING_UPLOAD" : "PENDING_REVIEW",
          },
        });
        if (evidenceCount > 0) {
          await tx.kakaoImageReceiveSession.updateMany({ where: { roomKey: normalizeSessionKey(roomName), senderKey: normalizeSessionKey(sender), status: "ACTIVE" }, data: { status: "CANCELLED" } });
          await tx.kakaoImageReceiveSession.create({ data: { publicCode, purpose: "DISCIPLINE_ISSUE", targetType: "DisciplineSubmission", targetId: created.id, roomKey: normalizeSessionKey(roomName), senderKey: normalizeSessionKey(sender), expectedImageCount: evidenceCount, expiresAt: new Date(Date.now() + 30 * 60 * 1000) } });
        }
        return created;
      });
      return kakaoJsonReply({
        reply: `[K-LOL.GG 경고 접수 완료]\n접수번호: ${submission.publicCode}\n사진: ${evidenceCount}장${evidenceCount > 0 ? "을 30분 안에 한 장씩 보내주세요." : "\n관리자 검토 대기 중입니다."}`,
        publicCode,
        clearSession: evidenceCount === 0,
        sessionActive: evidenceCount > 0,
      });
    }

    if (message.includes(`[${inhouseTemplate.title} v${inhouseTemplate.version}]`)) {
      const inhousePolicyRejected = policyReply(settings, "INHOUSE_RESULT_FORM", roomName, sender);
      if (inhousePolicyRejected) return inhousePolicyRejected;
      const parsed = parseManagedForm(message, inhouseTemplate);
      if (!parsed.ok) return kakaoJsonReply({ reply: `[K-LOL.GG 내전 결과 접수 실패]\n${parsed.message}` }, 400);
      const matchDate = parseKstDateOnly(parsed.values.matchDate);
      const gameCount = Number(parsed.values.gameCount);
      const seriesNumber = Number(parsed.values.seriesNumber);
      const teamBalanceDraftId = parsed.values.teamBalanceDraftId ? Number(parsed.values.teamBalanceDraftId) : null;
      if (!matchDate || ![2, 3].includes(gameCount) || !Number.isInteger(seriesNumber) || seriesNumber < 1 || (teamBalanceDraftId !== null && (!Number.isInteger(teamBalanceDraftId) || teamBalanceDraftId < 1))) {
        return kakaoJsonReply({ reply: "[K-LOL.GG 내전 결과 접수 실패]\n날짜, 세트 수(2/3), 회차 또는 팀 밸런스 번호를 확인해주세요." }, 400);
      }
      if (teamBalanceDraftId && !await prisma.teamBalanceDraft.findUnique({ where: { id: teamBalanceDraftId }, select: { id: true } })) return kakaoJsonReply({ reply: "[K-LOL.GG 내전 결과 접수 실패]\n팀 밸런스 번호를 찾을 수 없습니다." }, 400);
      const hash = makeSourceMessageHash("INHOUSE_RESULT", roomName, sender, sourceHashInput);
      const duplicate = await prisma.inhouseResultSubmission.findUnique({ where: { sourceMessageHash: hash } });
      if (duplicate) {
        const resume = await prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT "id" FROM "InhouseResultSubmission" WHERE "id" = ${duplicate.id} FOR UPDATE`;
          const current = await tx.inhouseResultSubmission.findUnique({
            where: { id: duplicate.id },
            include: { _count: { select: { images: true } } },
          });
          if (!current) throw new Error("INHOUSE_SUBMISSION_NOT_FOUND");
          const receivedCount = current._count.images;
          const remainingCount = Math.max(0, current.expectedGameCount - receivedCount);
          if (current.status === "AWAITING_UPLOAD" && remainingCount > 0) {
            await tx.kakaoImageReceiveSession.updateMany({
              where: {
                roomKey: normalizeSessionKey(roomName),
                senderKey: normalizeSessionKey(sender),
                status: "ACTIVE",
                NOT: { publicCode: duplicate.publicCode },
              },
              data: { status: "CANCELLED" },
            });
            await tx.kakaoImageReceiveSession.upsert({
              where: { publicCode: duplicate.publicCode },
              create: {
                publicCode: duplicate.publicCode,
                purpose: "INHOUSE_RESULT",
                targetType: "InhouseResultSubmission",
                targetId: duplicate.id,
                roomKey: normalizeSessionKey(roomName),
                senderKey: normalizeSessionKey(sender),
                expectedImageCount: current.expectedGameCount,
                receivedImageCount: receivedCount,
                expiresAt: new Date(Date.now() + 30 * 60 * 1000),
              },
              update: {
                roomKey: normalizeSessionKey(roomName),
                senderKey: normalizeSessionKey(sender),
                expectedImageCount: current.expectedGameCount,
                receivedImageCount: receivedCount,
                status: "ACTIVE",
                expiresAt: new Date(Date.now() + 30 * 60 * 1000),
              },
            });
          }
          return { status: current.status, expectedGameCount: current.expectedGameCount, receivedCount, remainingCount, resumed: current.status === "AWAITING_UPLOAD" && remainingCount > 0 };
        });
        if (resume.resumed) {
          return kakaoJsonReply({
            reply: `[K-LOL.GG 내전 결과 사진 접수 재개]\n접수번호: ${duplicate.publicCode}\n현재: ${resume.receivedCount}/${resume.expectedGameCount}장\n남은 사진 ${resume.remainingCount}장을 보내거나 관리자가 사이트에서 복구해주세요.\n${getPublicBaseUrl()}/matches/submit?code=${duplicate.publicCode}`,
            publicCode: duplicate.publicCode,
            sessionActive: true,
          });
        }
        return kakaoJsonReply({
          reply: `[K-LOL.GG 내전 결과 접수 완료]\n이미 접수된 양식입니다.\n접수번호: ${duplicate.publicCode}\n상태: ${statusLabel(resume.status)}`,
          publicCode: duplicate.publicCode,
          clearSession: true,
          sessionActive: false,
        });
      }
      const season = await prisma.season.findFirst({ where: { isActive: true }, orderBy: { id: "desc" }, select: { id: true } });
      const publicCode = makePublicCode("MR");
      const submission = await prisma.$transaction(async (tx) => {
        const created = await tx.inhouseResultSubmission.create({ data: { publicCode, templateId: inhouseTemplate.id, templateVersion: inhouseTemplate.version, templateSnapshot: managedTemplateSnapshot(inhouseTemplate), rawText: message, parsedData: parsed.values, seasonId: season?.id ?? null, matchDate, organizer: parsed.values.organizer, seriesNumber, expectedGameCount: gameCount, teamBalanceDraftId, roomName: roomName || null, sender: sender || null, sourceMessageHash: hash } });
        await tx.kakaoImageReceiveSession.updateMany({ where: { roomKey: normalizeSessionKey(roomName), senderKey: normalizeSessionKey(sender), status: "ACTIVE" }, data: { status: "CANCELLED" } });
        await tx.kakaoImageReceiveSession.create({ data: { publicCode, purpose: "INHOUSE_RESULT", targetType: "InhouseResultSubmission", targetId: created.id, roomKey: normalizeSessionKey(roomName), senderKey: normalizeSessionKey(sender), expectedImageCount: gameCount, expiresAt: new Date(Date.now() + 30 * 60 * 1000) } });
        return created;
      });
      return kakaoJsonReply({
        reply: `[K-LOL.GG 내전 결과 접수 완료]\n접수번호: ${submission.publicCode}\n1세트부터 결과 사진 ${gameCount}장을 보내주세요.\n카카오 사진 응답이 없으면 관리자가 사이트에서 한 번에 복구할 수 있습니다.\n${getPublicBaseUrl()}/matches/submit?code=${submission.publicCode}`,
        publicCode,
        sessionActive: true,
      });
    }

    return kakaoJsonReply({ reply: "[K-LOL.GG]\n인식 가능한 경고/내전등록 명령 또는 양식이 아닙니다." }, 400);
  } catch (error) {
    logServerError("[KAKAO_MANAGED_FORMS_ERROR]", error);
    return kakaoJsonReply({ reply: "[K-LOL.GG]\n접수 처리 중 오류가 발생했습니다." }, 500);
  }
}
