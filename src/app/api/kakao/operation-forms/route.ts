import { requireSiteFeature } from "@/lib/site/feature-guard";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { kakaoJsonReply } from "@/lib/kakao/reply-format";
import { createOperationFormSourceHash } from "@/lib/kakao/operation-form-idempotency";
import { evaluateKakaoRequestPolicy } from "@/lib/kakao/policy";
import { getKakaoOperationSettings } from "@/lib/kakao/settings";
import { getRequiredSecretInProduction, matchesRequestSecret } from "@/lib/security/secrets";
import {
  getKakaoOperationFormReply,
  parseKakaoOperationForm,
} from "@/lib/kakao/operation-forms";
import type { KakaoOperationFormType } from "@/lib/kakao/operation-forms";
import { logServerError } from "@/lib/server/safe-log";

async function readJsonBody(req: NextRequest) {
  return req.json().catch(() => ({})) as Promise<Record<string, unknown>>;
}

function rejectIfInvalidSecret(req: NextRequest, bodySecret: unknown) {
  const secret = getRequiredSecretInProduction("KAKAO_RECRUIT_SECRET");
  if (!secret) return null;

  const headerSecret = req.headers.get("x-kakao-recruit-secret");
  const fallbackHeaderSecret = req.headers.get("x-kakao-secret");
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const querySecret = req.nextUrl.searchParams.get("secret");
  const secretText = typeof bodySecret === "string" ? bodySecret : null;

  if (
    matchesRequestSecret(secret, {
      headers: [headerSecret, fallbackHeaderSecret],
      bearer,
      body: secretText,
      query: querySecret,
    })
  ) {
    return null;
  }

  return kakaoJsonReply(
    {
      ok: false,
      reply: "[K-LOL.GG 운영 양식 접수 실패]\n인증값이 올바르지 않습니다.",
    },
    401,
  );
}

function getBodyText(body: Record<string, unknown>) {
  const userRequest = body.userRequest as { utterance?: unknown } | undefined;
  return String(body.message || body.text || body.utterance || userRequest?.utterance || "");
}

function getOptionalText(value: unknown) {
  const text = String(value || "").trim();
  return text || null;
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function createIdempotent<T>(input: {
  create: () => Promise<T>;
  findExisting: () => Promise<T | null>;
}) {
  try {
    return { item: await input.create(), duplicate: false };
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    const existing = await input.findExisting();
    if (!existing) throw error;
    return { item: existing, duplicate: true };
  }
}

function operationFormSuccess(input: { type: KakaoOperationFormType; id: number; duplicate: boolean }) {
  return kakaoJsonReply({
    ok: true,
    type: input.type,
    id: input.id,
    duplicate: input.duplicate,
    reply: input.duplicate ? "" : getKakaoOperationFormReply(input.type),
  });
}

function isOperationFormTypeEnabled(
  settings: Awaited<ReturnType<typeof getKakaoOperationSettings>>,
  type: KakaoOperationFormType,
) {
  if (type === "friends") return settings.friendApplicationEnabled;
  if (type === "suggestions") return settings.suggestionRequestEnabled;
  if (type === "meetups") return settings.meetupRecordEnabled;
  return settings.leaveRequestEnabled;
}

export async function POST(req: NextRequest) {
  const premiumLock = await requireSiteFeature("kakao");
  if (premiumLock) return premiumLock;

  try {
    const body = await readJsonBody(req);
    const rejected = rejectIfInvalidSecret(req, body.secret);
    if (rejected) return rejected;

    const message = getBodyText(body);
    const roomName = getOptionalText(body.roomName || body.room);
    const sender = getOptionalText(body.sender);
    const settings = await getKakaoOperationSettings();
    const policy = evaluateKakaoRequestPolicy(settings, {
      feature: "OPERATION_FORM",
      roomName,
      sender,
      requireRoom: true,
      requireSender: true,
    });
    if (!policy.ok) {
      return kakaoJsonReply(
        { ok: false, reply: policy.message, policyReason: policy.reason },
        policy.status,
      );
    }

    const parsed = parseKakaoOperationForm(message);

    if (!parsed) {
      return kakaoJsonReply(
        {
          ok: false,
          reply: "[K-LOL.GG 운영 양식 접수 실패]\n인식 가능한 운영 양식이 아닙니다.",
        },
        400,
      );
    }

    if (!isOperationFormTypeEnabled(settings, parsed.type)) {
      return kakaoJsonReply(
        {
          ok: false,
          reply: settings.disabledFeatureMessage,
          policyReason: "FEATURE_DISABLED",
        },
        403,
      );
    }

    const sourceHash = createOperationFormSourceHash({
      type: parsed.type,
      rawText: parsed.rawText,
      roomName,
      sender,
    });

    if (parsed.type === "friends") {
      const result = await createIdempotent({
        create: () => prisma.kakaoFriendApplication.create({
          data: {
            sourceHash,
            friendName: parsed.friendName,
            friendNickname: parsed.friendNickname,
            usageType: parsed.usageType,
            gameName: parsed.gameName,
            discordNicknameChange: parsed.discordNicknameChange,
            rawText: parsed.rawText,
            roomName,
            sender,
          },
        }),
        findExisting: () => prisma.kakaoFriendApplication.findUnique({ where: { sourceHash } }),
      });

      return operationFormSuccess({ type: parsed.type, id: result.item.id, duplicate: result.duplicate });
    }

    if (parsed.type === "suggestions") {
      if (!parsed.requesterInfo || !parsed.reason || !parsed.content) {
        return kakaoJsonReply({ ok: false, reply: "[건의 접수 실패]\n필수 항목이 비어 있습니다." }, 400);
      }

      const result = await createIdempotent({
        create: () => prisma.kakaoSuggestionRequest.create({
          data: {
            sourceHash,
            requesterInfo: parsed.requesterInfo,
            reason: parsed.reason,
            content: parsed.content,
            rawText: parsed.rawText,
            roomName,
            sender,
          },
        }),
        findExisting: () => prisma.kakaoSuggestionRequest.findUnique({ where: { sourceHash } }),
      });

      return operationFormSuccess({ type: parsed.type, id: result.item.id, duplicate: result.duplicate });
    }

    if (parsed.type === "meetups") {
      if (!parsed.hostInfo || !parsed.eventDateText || !parsed.place || !parsed.participants) {
        return kakaoJsonReply({ ok: false, reply: "[모임 등록 접수 실패]\n필수 항목이 비어 있습니다." }, 400);
      }

      const result = await createIdempotent({
        create: () => prisma.kakaoMeetupRecord.create({
          data: {
            sourceHash,
            hostInfo: parsed.hostInfo,
            eventDateText: parsed.eventDateText,
            place: parsed.place,
            participants: parsed.participants,
            rawText: parsed.rawText,
            roomName,
            sender,
          },
        }),
        findExisting: () => prisma.kakaoMeetupRecord.findUnique({ where: { sourceHash } }),
      });

      return operationFormSuccess({ type: parsed.type, id: result.item.id, duplicate: result.duplicate });
    }

    if (!parsed.requesterInfo || !parsed.leavePeriod || !parsed.reason || !parsed.scope) {
      return kakaoJsonReply({ ok: false, reply: "[외출 신청 접수 실패]\n필수 항목이 비어 있습니다." }, 400);
    }

    const result = await createIdempotent({
      create: () => prisma.kakaoLeaveRequest.create({
        data: {
          sourceHash,
          requesterInfo: parsed.requesterInfo,
          leavePeriod: parsed.leavePeriod,
          reason: parsed.reason,
          scope: parsed.scope,
          rawText: parsed.rawText,
          roomName,
          sender,
        },
      }),
      findExisting: () => prisma.kakaoLeaveRequest.findUnique({ where: { sourceHash } }),
    });

    return operationFormSuccess({ type: parsed.type, id: result.item.id, duplicate: result.duplicate });
  } catch (error) {
    logServerError("[KAKAO_OPERATION_FORM_POST_ERROR]", error, { endpoint: "/api/kakao/operation-forms" });

    return kakaoJsonReply(
      {
        ok: false,
        reply: "[K-LOL.GG 운영 양식 접수 오류]\n서버 처리 중 오류가 발생했습니다.",
      },
      500,
    );
  }
}
