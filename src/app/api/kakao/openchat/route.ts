import { NextRequest, NextResponse } from "next/server";
import { rejectIfRateLimited } from "@/lib/rate-limit";
import { getKakaoHelpMessage, parseKakaoCommand } from "@/lib/kakao/parseKakaoCommand";
import {
  formatPlayerRecordMessage,
  formatRankingMessage,
  formatRecentGamesMessage,
} from "@/lib/kakao/formatPlayerRecordMessage";
import {
  getPlayerRecordForKakao,
  getRankingForKakao,
} from "@/features/player/services/getPlayerRecordForKakao";

type KakaoOpenchatBody = {
  message?: string;
  text?: string;
  utterance?: string;
  room?: string;
  sender?: string;
  userRequest?: {
    utterance?: string;
  };
};

function jsonReply(reply: string, status = 200) {
  return NextResponse.json(
    { reply },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}


function rejectIfInvalidSecret(req: NextRequest) {
  const secret = process.env.KAKAO_OPENCHAT_SECRET;

  if (!secret) return null;

  const headerSecret = req.headers.get("x-kakao-openchat-secret");
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (headerSecret === secret || bearer === secret) return null;

  return jsonReply("인증되지 않은 요청입니다.", 401);
}

function extractMessage(body: KakaoOpenchatBody) {
  return (
    body.message ??
    body.text ??
    body.utterance ??
    body.userRequest?.utterance ??
    ""
  );
}

async function handleMessage(message: string) {
  const command = parseKakaoCommand(message);

  if (command.type === "help") {
    return jsonReply(getKakaoHelpMessage());
  }

  if (command.type === "ranking") {
    const rows = await getRankingForKakao();
    return jsonReply(formatRankingMessage(rows));
  }

  if (command.type === "record" || command.type === "recent") {
    if (!command.query) {
      return jsonReply([
        "닉네임#태그 형식으로 입력해주세요.",
        "",
        "예시: 전적 sax0ph0ne#99단굵묵"
      ].join("\n"), 400);
    }

    const record = await getPlayerRecordForKakao(command.query);

    if (!record) {
      return jsonReply([
        "검색 결과가 없습니다.",
        "닉네임#태그를 확인해주세요.",
        "",
        "예시: 전적 sax0ph0ne#99단굵묵"
      ].join("\n"), 404);
    }

    return jsonReply(
      command.type === "recent"
        ? formatRecentGamesMessage(record)
        : formatPlayerRecordMessage(record),
    );
  }

  // PC 테스트 중 한글 인코딩이 깨진 경우에도 PowerShell이 예외를 던지지 않도록 200으로 도움말을 반환합니다.
  return jsonReply(getKakaoHelpMessage());
}

export async function POST(req: NextRequest) {
  try {
    const secretRejected = rejectIfInvalidSecret(req);
    if (secretRejected) return secretRejected;

    const rateLimitRejected = await rejectIfRateLimited(req, {
      action: "KAKAO_OPENCHAT",
      limit: 60,
      windowSeconds: 60,
    });
    if (rateLimitRejected) return rateLimitRejected;

    const body = (await req.json().catch(() => ({}))) as KakaoOpenchatBody;
    return handleMessage(extractMessage(body));
  } catch (error) {
    console.error("[KAKAO_OPENCHAT_POST_ERROR]", error);

    return jsonReply([
      "전적 조회 중 오류가 발생했습니다.",
      "잠시 후 다시 시도해주세요.",
    ].join("\n"), 500);
  }
}

export async function GET(req: NextRequest) {
  const secretRejected = rejectIfInvalidSecret(req);
  if (secretRejected) return secretRejected;

  const rateLimitRejected = await rejectIfRateLimited(req, {
    action: "KAKAO_OPENCHAT",
    limit: 60,
    windowSeconds: 60,
  });
  if (rateLimitRejected) return rateLimitRejected;

  const message = req.nextUrl.searchParams.get("message") ?? "도움말";
  return handleMessage(message);
}
