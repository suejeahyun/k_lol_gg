import { requireSiteFeature } from "@/lib/site/feature-guard";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest } from "next/server";
import {
  partyRecruitJson,
  readJsonBody,
  rejectIfInvalidPartySecret,
} from "../_shared";

async function handle(req: NextRequest, bodySecret?: unknown) {
  const rejected = rejectIfInvalidPartySecret(req, bodySecret ?? req.nextUrl.searchParams.get("secret"));
  if (rejected) return rejected;

  return partyRecruitJson(
    {
      ok: false,
      reply: "[K-LOL.GG 파티 자동종료 사용 안 함]\n파티는 모집번호+ㅉ으로만 종료합니다.",
    },
    410,
  );
}

export async function GET(req: NextRequest) {
  const premiumLock = await requireSiteFeature("recruit");
  if (premiumLock) return premiumLock;

  return handle(req);
}

export async function POST(req: NextRequest) {
  const premiumLock = await requireSiteFeature("recruit");
  if (premiumLock) return premiumLock;

  const body = await readJsonBody(req);
  return handle(req, body.secret);
}
