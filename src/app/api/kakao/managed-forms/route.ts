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
} from "@/lib/kakao/managed-forms";
import { isAuthorizedKakaoRequest, normalizeSessionKey } from "@/lib/kakao/request-auth";
import { logServerError } from "@/lib/server/safe-log";
import { getKstDateKey } from "@/lib/date/kst";
import { requireSiteFeature } from "@/lib/site/feature-guard";

function text(value: unknown) {
  return String(value ?? "").trim();
}

function roomAllowed(room: string, allowed: string[]) {
  return allowed.length === 0 || allowed.some((item) => item.trim() === room);
}

function disabled(message: string) {
  return kakaoJsonReply({ reply: message, statusCode: 403 }, 403);
}

async function statusReply(message: string) {
  const [command, code] = message.split(/\s+/, 2);
  if (!code) return null;
  if (command === "/경고현황") {
    const submission = await prisma.disciplineSubmission.findUnique({ where: { publicCode: code.toUpperCase() } });
    const task = await prisma.disciplineResolutionTask.findUnique({ where: { publicCode: code.toUpperCase() }, include: { _count: { select: { evidence: true } } } });
    if (submission) return `[K-LOL.GG 경고 접수 현황]\n접수번호: ${submission.publicCode}\n상태: ${submission.status}`;
    if (task) return `[K-LOL.GG 경고 차감 현황]\n인증번호: ${task.publicCode}\n상태: ${task.status}\n인증 사진: ${task._count.evidence}/${task.requiredGameCount}장\n필요 판수: ${task.requiredGameCount}판\n기한: ${getKstDateKey(task.dueAt)}`;
    return "[K-LOL.GG 경고 현황]\n접수번호를 찾을 수 없습니다.";
  }
  if (command === "/내전등록현황") {
    const item = await prisma.inhouseResultSubmission.findUnique({
      where: { publicCode: code.toUpperCase() },
      include: { _count: { select: { images: true } } },
    });
    return item
      ? `[K-LOL.GG 내전 결과 현황]\n접수번호: ${item.publicCode}\n상태: ${item.status}\n사진: ${item._count.images}/${item.expectedGameCount}장`
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
    const message = text(body.message || body.text);
    const roomName = text(body.roomName || body.room);
    const sender = text(body.sender);
    if (!roomName || !sender) return kakaoJsonReply({ reply: "[K-LOL.GG]\n방 이름과 보낸 사람 정보가 필요합니다." }, 400);
    const settings = await getKakaoOperationSettings();
    if (!settings.globalEnabled || settings.maintenanceMode) return disabled(settings.maintenanceMode ? settings.maintenanceMessage : settings.disabledFeatureMessage);

    if (message.startsWith("/경고인증 ")) {
      if (!settings.disciplineEvidenceEnabled) return disabled(settings.disabledFeatureMessage);
      if (!roomAllowed(roomName, settings.allowedDisciplineRooms)) return disabled(settings.blockedRoomMessage);
      const code = message.split(/\s+/, 2)[1]?.toUpperCase();
      const task = code ? await prisma.disciplineResolutionTask.findUnique({ where: { publicCode: code }, include: { _count: { select: { evidence: true } } } }) : null;
      if (!task || !["REQUIRED", "REJECTED", "AWAITING_UPLOAD"].includes(task.status)) return kakaoJsonReply({ reply: "[K-LOL.GG 경고 인증 실패]\n인증번호가 없거나 현재 사진을 받을 수 없는 상태입니다." }, 404);
      if (task.dueAt <= new Date()) return kakaoJsonReply({ reply: `[K-LOL.GG 경고 인증 실패]\n인증 기한(${getKstDateKey(task.dueAt)})이 지났습니다. 관리자에게 문의해주세요.` }, 409);
      const remainingImageCount = Math.max(0, task.requiredGameCount - task._count.evidence);
      if (remainingImageCount === 0) {
        await prisma.disciplineResolutionTask.update({ where: { id: task.id }, data: { status: "PENDING_REVIEW", submittedAt: task.submittedAt ?? new Date(), claimedGameCount: task.requiredGameCount } });
        return kakaoJsonReply({ reply: `[K-LOL.GG 경고 인증]\n인증번호: ${task.publicCode}\n사진 ${task.requiredGameCount}/${task.requiredGameCount}장이 모두 접수되어 관리자 검토 대기 중입니다.` });
      }
      await prisma.$transaction(async (tx) => {
        await tx.kakaoImageReceiveSession.updateMany({ where: { roomKey: normalizeSessionKey(roomName), senderKey: normalizeSessionKey(sender), status: "ACTIVE" }, data: { status: "CANCELLED" } });
        await tx.kakaoImageReceiveSession.create({ data: { publicCode: makePublicCode("EV"), purpose: "DISCIPLINE_RESOLUTION", targetType: "DisciplineResolutionTask", targetId: task.id, roomKey: normalizeSessionKey(roomName), senderKey: normalizeSessionKey(sender), expectedImageCount: remainingImageCount, expiresAt: new Date(Date.now() + 30 * 60 * 1000) } });
        await tx.disciplineResolutionTask.update({ where: { id: task.id }, data: { status: "AWAITING_UPLOAD" } });
      });
      return kakaoJsonReply({ reply: `[K-LOL.GG 경고 인증 시작]\n인증번호: ${task.publicCode}\n현재: ${task._count.evidence}/${task.requiredGameCount}장\n남은 사진: ${remainingImageCount}장\n한 판당 사진 1장씩 30분 안에 보내주세요. 시간이 지나면 같은 명령으로 이어서 제출할 수 있습니다.` });
    }

    if (message.startsWith("/경고인증완료 ")) {
      return kakaoJsonReply({ reply: "[K-LOL.GG 경고 인증]\n일반은 10장, 내전은 15장이 모두 접수되면 자동으로 관리자 검토 대기로 전환됩니다. /경고현황 인증번호 로 확인해주세요." });
    }

    const currentStatus = settings.disciplineStatusEnabled ? await statusReply(message) : null;
    if (currentStatus) return kakaoJsonReply({ reply: currentStatus });

    const [disciplineTemplate, inhouseTemplate] = await Promise.all([
      getPublishedManagedTemplate("DISCIPLINE"),
      getPublishedManagedTemplate("INHOUSE_RESULT"),
    ]);

    if (disciplineTemplate.commandAliases.includes(message)) {
      if (!settings.disciplineFormEnabled) return disabled(settings.disabledFeatureMessage);
      if (!roomAllowed(roomName, settings.allowedDisciplineRooms)) return disabled(settings.blockedRoomMessage);
      return kakaoJsonReply({ reply: renderManagedTemplate(disciplineTemplate), formType: "DISCIPLINE" });
    }
    if (inhouseTemplate.commandAliases.includes(message)) {
      if (!settings.inhouseResultFormEnabled) return disabled(settings.disabledFeatureMessage);
      if (!roomAllowed(roomName, settings.allowedInhouseResultRooms)) return disabled(settings.blockedRoomMessage);
      return kakaoJsonReply({ reply: renderManagedTemplate(inhouseTemplate), formType: "INHOUSE_RESULT" });
    }

    if (message.includes(`[${disciplineTemplate.title} v${disciplineTemplate.version}]`)) {
      if (!settings.disciplineFormEnabled || !roomAllowed(roomName, settings.allowedDisciplineRooms)) return disabled(settings.disabledFeatureMessage);
      const parsed = parseManagedForm(message, disciplineTemplate);
      if (!parsed.ok) return kakaoJsonReply({ reply: `[K-LOL.GG 경고 접수 실패]\n${parsed.message}` }, 400);
      const nicknameTag = parseNicknameTag(parsed.values.targetNicknameTag);
      const issuedAt = parseKstDateOnly(parsed.values.issuedDate);
      const category = parsed.values.warningCategory === "내전" ? "INHOUSE" : parsed.values.warningCategory === "일반" ? "GENERAL" : null;
      const evidenceCount = Number(parsed.values.evidenceImageCount);
      if (!nicknameTag || !issuedAt || !category || !Number.isInteger(evidenceCount) || evidenceCount < 0 || evidenceCount > 3) {
        return kakaoJsonReply({ reply: "[K-LOL.GG 경고 접수 실패]\n닉네임#태그, 구분, 날짜 또는 경고 부여 근거 사진 수(0~3)를 확인해주세요." }, 400);
      }
      const hash = makeSourceMessageHash("DISCIPLINE", roomName, sender, message);
      const duplicate = await prisma.disciplineSubmission.findUnique({ where: { sourceMessageHash: hash } });
      if (duplicate) return kakaoJsonReply({ reply: `[K-LOL.GG 경고 접수 완료]\n이미 접수된 양식입니다.\n접수번호: ${duplicate.publicCode}\n상태: ${duplicate.status}` });
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
      return kakaoJsonReply({ reply: `[K-LOL.GG 경고 접수 완료]\n접수번호: ${submission.publicCode}\n사진: ${evidenceCount}장${evidenceCount > 0 ? "을 30분 안에 한 장씩 보내주세요." : "\n관리자 검토 대기 중입니다."}`, publicCode });
    }

    if (message.includes(`[${inhouseTemplate.title} v${inhouseTemplate.version}]`)) {
      if (!settings.inhouseResultFormEnabled || !roomAllowed(roomName, settings.allowedInhouseResultRooms)) return disabled(settings.disabledFeatureMessage);
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
      const hash = makeSourceMessageHash("INHOUSE_RESULT", roomName, sender, message);
      const duplicate = await prisma.inhouseResultSubmission.findUnique({ where: { sourceMessageHash: hash } });
      if (duplicate) return kakaoJsonReply({ reply: `[K-LOL.GG 내전 결과 접수 완료]\n이미 접수된 양식입니다.\n접수번호: ${duplicate.publicCode}\n상태: ${duplicate.status}` });
      const season = await prisma.season.findFirst({ where: { isActive: true }, orderBy: { id: "desc" }, select: { id: true } });
      const publicCode = makePublicCode("MR");
      const submission = await prisma.$transaction(async (tx) => {
        const created = await tx.inhouseResultSubmission.create({ data: { publicCode, templateId: inhouseTemplate.id, templateVersion: inhouseTemplate.version, templateSnapshot: managedTemplateSnapshot(inhouseTemplate), rawText: message, parsedData: parsed.values, seasonId: season?.id ?? null, matchDate, organizer: parsed.values.organizer, seriesNumber, expectedGameCount: gameCount, teamBalanceDraftId, roomName: roomName || null, sender: sender || null, sourceMessageHash: hash } });
        await tx.kakaoImageReceiveSession.updateMany({ where: { roomKey: normalizeSessionKey(roomName), senderKey: normalizeSessionKey(sender), status: "ACTIVE" }, data: { status: "CANCELLED" } });
        await tx.kakaoImageReceiveSession.create({ data: { publicCode, purpose: "INHOUSE_RESULT", targetType: "InhouseResultSubmission", targetId: created.id, roomKey: normalizeSessionKey(roomName), senderKey: normalizeSessionKey(sender), expectedImageCount: gameCount, expiresAt: new Date(Date.now() + 30 * 60 * 1000) } });
        return created;
      });
      return kakaoJsonReply({ reply: `[K-LOL.GG 내전 결과 접수 완료]\n접수번호: ${submission.publicCode}\n1세트부터 결과 사진 ${gameCount}장을 30분 안에 한 장씩 보내주세요.`, publicCode });
    }

    return kakaoJsonReply({ reply: "[K-LOL.GG]\n인식 가능한 경고/내전등록 명령 또는 양식이 아닙니다." }, 400);
  } catch (error) {
    logServerError("[KAKAO_MANAGED_FORMS_ERROR]", error);
    return kakaoJsonReply({ reply: "[K-LOL.GG]\n접수 처리 중 오류가 발생했습니다." }, 500);
  }
}
