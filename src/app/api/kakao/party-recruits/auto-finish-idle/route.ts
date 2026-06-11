export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest } from "next/server";
import { runRecruitIdleAutoFinishIfNeeded } from "@/lib/kakao/recruit-idle-auto-finish";
import {
  partyRecruitJson,
  readJsonBody,
  rejectIfInvalidPartySecret,
} from "../_shared";

async function handle(req: NextRequest, bodySecret?: unknown) {
  const rejected = rejectIfInvalidPartySecret(req, bodySecret ?? req.nextUrl.searchParams.get("secret"));
  if (rejected) return rejected;

  try {
    const result = await runRecruitIdleAutoFinishIfNeeded({ source: "kakao-auto-finish-idle-api" });
    return partyRecruitJson({
      ok: true,
      result,
      reply: result.executed
        ? `[K-LOL.GG 구인구직 자동종료]\n활동 없는 구인글 ${result.finishedCount}개를 자동종료했습니다.`
        : "[K-LOL.GG 구인구직 자동종료]\n자동종료 대상 구인글이 없습니다.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return partyRecruitJson(
      {
        ok: false,
        reply: `[K-LOL.GG 구인구직 자동종료 실패]\n${message || "서버 처리 중 오류가 발생했습니다."}`,
        error: message,
      },
      500,
    );
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  const body = await readJsonBody(req);
  return handle(req, body.secret);
}
