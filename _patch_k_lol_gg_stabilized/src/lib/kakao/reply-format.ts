import { NextResponse } from "next/server";

export const KAKAO_BRAND = "K-LOL.GG";
export const KAKAO_API_FORMAT_VERSION = "kakao-api-v2";

export type KakaoResponseBody = {
  ok?: boolean;
  reply: string;
  statusCode?: number;
  formatVersion?: string;
  [key: string]: unknown;
};

export function buildKakaoHeader(scope: string, status?: string) {
  return `[${KAKAO_BRAND} ${scope}${status ? ` ${status}` : ""}]`;
}

export function kakaoLines(lines: Array<string | number | null | undefined | false>) {
  return lines
    .filter((line): line is string | number => line !== null && line !== undefined && line !== false)
    .map((line) => String(line))
    .join("\n");
}

export function kakaoJsonReply(
  body: KakaoResponseBody,
  statusCode = 200,
) {
  return NextResponse.json(
    {
      ok: statusCode >= 200 && statusCode < 300,
      statusCode,
      formatVersion: body.formatVersion ?? KAKAO_API_FORMAT_VERSION,
      ...body,
    },
    {
      // 카카오봇 Jsoup은 400/404/500에서 HttpStatusException을 던질 수 있으므로
      // 카카오 API 계열은 HTTP 200으로 통일하고 실제 상태는 statusCode에 담습니다.
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
