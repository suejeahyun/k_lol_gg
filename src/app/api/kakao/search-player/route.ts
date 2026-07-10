import { requireSiteFeature } from "@/lib/site/feature-guard";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { getPlayerRecordForKakao } from "@/features/player/services/getPlayerRecordForKakao";
import { formatPlayerRecordMessage } from "@/lib/kakao/formatPlayerRecordMessage";
import { createSimpleText } from "@/lib/kakao/response";
import { rejectIfRateLimited } from "@/lib/rate-limit";
import { getOptionalSecret } from "@/lib/security/secrets";
import { logServerError } from "@/lib/server/safe-log";

function kakaoText(text: string, status = 200) {
  return NextResponse.json(createSimpleText(text), {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function rejectIfInvalidSecret(req: NextRequest) {
  const secret =
    getOptionalSecret("KAKAO_SEARCH_PLAYER_SECRET") ||
    getOptionalSecret("KAKAO_OPENCHAT_SECRET");

  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return kakaoText("KAKAO_SEARCH_PLAYER_SECRET 또는 KAKAO_OPENCHAT_SECRET 환경변수가 설정되지 않았습니다.", 200);
    }

    return null;
  }

  const headerSecret = req.headers.get("x-kakao-search-player-secret");
  const openchatSecret = req.headers.get("x-kakao-openchat-secret");
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const querySecret = req.nextUrl.searchParams.get("secret");

  if ([headerSecret, openchatSecret, bearer, querySecret].includes(secret)) {
    return null;
  }

  return kakaoText("인증되지 않은 요청입니다.", 200);
}

function parseSearchKeyword(input: string) {
  return input
    .trim()
    .replace(/^전적검색\s*/i, "")
    .replace(/^전적\s*/i, "")
    .trim();
}

function extractQueryFromBody(body: Record<string, unknown>) {
  const action = body.action as
    | {
        params?: Record<string, unknown>;
        detailParams?: Record<string, { origin?: unknown; value?: unknown }>;
      }
    | undefined;
  const userRequest = body.userRequest as { utterance?: unknown } | undefined;

  return String(
    action?.params?.nickname ||
      action?.detailParams?.nickname?.origin ||
      action?.detailParams?.nickname?.value ||
      userRequest?.utterance ||
      body.message ||
      body.text ||
      "",
  );
}

async function handleSearch(req: NextRequest, rawQuery: string) {
  const secretRejected = rejectIfInvalidSecret(req);
  if (secretRejected) return secretRejected;

  const rateLimitRejected = await rejectIfRateLimited(req, {
    action: "KAKAO_SEARCH_PLAYER",
    limit: 30,
    windowSeconds: 60,
  });

  if (rateLimitRejected) {
    return kakaoText("요청이 너무 많습니다. 잠시 후 다시 시도해주세요.");
  }

  const query = parseSearchKeyword(rawQuery);

  if (!query) {
    return kakaoText([
      "닉네임#태그 형식으로 입력해주세요.",
      "",
      "예시: 전적 sax0ph0ne#99단굵묵",
    ].join("\n"));
  }

  const record = await getPlayerRecordForKakao(query);

  if (!record) {
    return kakaoText([
      "검색 결과가 없습니다.",
      "닉네임#태그를 확인해주세요.",
      "",
      `입력값: ${query}`,
    ].join("\n"));
  }

  return kakaoText(formatPlayerRecordMessage(record));
}

export async function POST(req: NextRequest) {
  const premiumLock = await requireSiteFeature("kakao");
  if (premiumLock) return premiumLock;

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return handleSearch(req, extractQueryFromBody(body));
  } catch (error) {
    logServerError("[KAKAO_SEARCH_PLAYER_ERROR]", error, { endpoint: "/api/kakao/search-player", method: "POST" });

    return kakaoText([
      "전적 검색 중 오류가 발생했습니다.",
      "잠시 후 다시 시도해주세요.",
    ].join("\n"));
  }
}

export async function GET(req: NextRequest) {
  const premiumLock = await requireSiteFeature("kakao");
  if (premiumLock) return premiumLock;

  try {
    return handleSearch(req, req.nextUrl.searchParams.get("q") ?? "");
  } catch (error) {
    logServerError("[KAKAO_SEARCH_PLAYER_GET_ERROR]", error, { endpoint: "/api/kakao/search-player", method: "GET" });

    return kakaoText([
      "전적 검색 중 오류가 발생했습니다.",
      "잠시 후 다시 시도해주세요.",
    ].join("\n"));
  }
}
