export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest } from "next/server";
import { parseScrimNumberCommand } from "@/lib/kakao/destruction-scrim-recruit";
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
    const detailNo = extractDetailNo(message || req.nextUrl.searchParams.get("message") || "");
    const payload = await getScrimStatusPayload(detailNo);
    return scrimRecruitJson(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return scrimRecruitJson({ reply: `[K-LOL.GG 스크림현황 실패]\n${message}`, error: message }, 500);
  }
}

export async function GET(req: NextRequest) {
  return handleStatus(req);
}

export async function POST(req: NextRequest) {
  const body = await readJsonBody(req);
  return handleStatus(req, body.secret, getBodyText(body));
}
