import { requireSiteFeature } from "@/lib/site/feature-guard";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { kakaoJsonReply } from "@/lib/kakao/reply-format";
import { getRequiredSecretInProduction } from "@/lib/security/secrets";
import {
  getKakaoOperationFormReply,
  parseKakaoOperationForm,
} from "@/lib/kakao/operation-forms";
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
    headerSecret === secret ||
    fallbackHeaderSecret === secret ||
    bearer === secret ||
    querySecret === secret ||
    secretText === secret
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

    if (parsed.type === "suggestions") {
      if (!parsed.requesterInfo || !parsed.reason || !parsed.content) {
        return kakaoJsonReply({ ok: false, reply: "[건의 접수 실패]\n필수 항목이 비어 있습니다." }, 400);
      }

      const item = await prisma.kakaoSuggestionRequest.create({
        data: {
          requesterInfo: parsed.requesterInfo,
          reason: parsed.reason,
          content: parsed.content,
          rawText: parsed.rawText,
          roomName,
          sender,
        },
      });

      return kakaoJsonReply({ ok: true, type: parsed.type, id: item.id, reply: getKakaoOperationFormReply(parsed.type) });
    }

    if (parsed.type === "meetups") {
      if (!parsed.hostInfo || !parsed.eventDateText || !parsed.place || !parsed.participants) {
        return kakaoJsonReply({ ok: false, reply: "[모임 등록 접수 실패]\n필수 항목이 비어 있습니다." }, 400);
      }

      const item = await prisma.kakaoMeetupRecord.create({
        data: {
          hostInfo: parsed.hostInfo,
          eventDateText: parsed.eventDateText,
          place: parsed.place,
          participants: parsed.participants,
          rawText: parsed.rawText,
          roomName,
          sender,
        },
      });

      return kakaoJsonReply({ ok: true, type: parsed.type, id: item.id, reply: getKakaoOperationFormReply(parsed.type) });
    }

    if (!parsed.requesterInfo || !parsed.leavePeriod || !parsed.reason || !parsed.scope) {
      return kakaoJsonReply({ ok: false, reply: "[외출 신청 접수 실패]\n필수 항목이 비어 있습니다." }, 400);
    }

    const item = await prisma.kakaoLeaveRequest.create({
      data: {
        requesterInfo: parsed.requesterInfo,
        leavePeriod: parsed.leavePeriod,
        reason: parsed.reason,
        scope: parsed.scope,
        rawText: parsed.rawText,
        roomName,
        sender,
      },
    });

    return kakaoJsonReply({ ok: true, type: parsed.type, id: item.id, reply: getKakaoOperationFormReply(parsed.type) });
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
