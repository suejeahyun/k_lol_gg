export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest } from "next/server";
import { buildRecruitResetReply, isRecruitResetCommand, resetRecruitNumbers } from "@/lib/kakao/recruit-reset";
import { getBodyRoom, getBodySender, getBodyText, partyRecruitJson, readJsonBody, rejectIfInvalidPartySecret } from "../_shared";

export async function POST(req: NextRequest) {
  try {
    const body = await readJsonBody(req);
    const secretRejected = rejectIfInvalidPartySecret(req, body.secret);
    if (secretRejected) return secretRejected;

    const message = getBodyText(body);
    if (message && !isRecruitResetCommand(message)) {
      return partyRecruitJson(
        {
          reply: [
            "[K-LOL.GG 구인구직 모집번호 초기화 실패]",
            "",
            "명령어 형식이 올바르지 않습니다.",
            "예시: 모집번호초기화",
          ].join("\n"),
        },
        400,
      );
    }

    const result = await resetRecruitNumbers({
      roomName: getBodyRoom(body),
      sender: getBodySender(body),
    });

    return partyRecruitJson({
      result,
      reply: buildRecruitResetReply(result),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return partyRecruitJson(
      {
        reply: `[K-LOL.GG 구인구직 모집번호 초기화 실패]\n${message || "서버 처리 중 오류가 발생했습니다."}`,
        error: message,
      },
      500,
    );
  }
}
