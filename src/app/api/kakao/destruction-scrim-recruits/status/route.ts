import { requireSiteFeature } from "@/lib/site/feature-guard";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest } from "next/server";
import { parseScrimNumberCommand } from "@/lib/kakao/destruction-scrim-recruit";
import { classifyKakaoRecruitMessage, buildWrongRecruitApiReply } from "@/lib/kakao/recruit-message-kind";
import {
  getBodyText,
  getScrimStatusPayload,
  readJsonBody,
  rejectIfInvalidScrimSecret,
  scrimRecruitJson,
} from "../_shared";

function extractDetailNo(message: string) {
  const parsed = parseScrimNumberCommand(message);
  if (parsed?.scrimNo) return parsed.scrimNo;
  const match = String(message || "").match(/#?\s*(\d{1,3})/);
  return match ? Number(match[1]) : null;
}

async function handleStatus(req: NextRequest, bodySecret?: unknown, message?: string) {
  const rejected = rejectIfInvalidScrimSecret(req, bodySecret);
  if (rejected) return rejected;

  try {
    const messageText = message || req.nextUrl.searchParams.get("message") || "스크림현황";
    const classification = classifyKakaoRecruitMessage(messageText);
    if (classification.kind !== "SCRIM_RECRUIT") {
      return scrimRecruitJson(
        { reply: buildWrongRecruitApiReply({ expected: "스크림구인", actual: classification.kind }) },
        400,
      );
    }

    const detailNo = extractDetailNo(messageText);
    const payload = await getScrimStatusPayload(detailNo);
    return scrimRecruitJson(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return scrimRecruitJson({ reply: `[K-LOL.GG 스크림현황 실패]\n${message}`, error: message }, 500);
  }
}

export async function GET(req: NextRequest) {
  const premiumLock = await requireSiteFeature("recruit");
  if (premiumLock) return premiumLock;

  return handleStatus(req);
}

export async function POST(req: NextRequest) {
  const premiumLock = await requireSiteFeature("recruit");
  if (premiumLock) return premiumLock;

  const body = await readJsonBody(req);
  return handleStatus(req, body.secret, getBodyText(body));
}
