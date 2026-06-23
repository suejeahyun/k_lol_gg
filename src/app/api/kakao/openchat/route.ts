import { NextRequest, NextResponse } from "next/server";
import { rejectIfRateLimited } from "@/lib/rate-limit";
import { getRequiredSecretInProduction } from "@/lib/security/secrets";
import { getKakaoHelpMessage, getKakaoRecruitHelpMessage, parseKakaoCommand } from "@/lib/kakao/parseKakaoCommand";
import { parseRecruitMessage } from "@/lib/kakao/recruit-message-parser";
import {
  formatPlayerRecordMessage,
  formatRankingMessage,
  formatRecentGamesMessage,
} from "@/lib/kakao/formatPlayerRecordMessage";
import {
  getPlayerRecordForKakao,
  getRankingForKakao,
} from "@/features/player/services/getPlayerRecordForKakao";
import { logServerError } from "@/lib/server/safe-log";

type KakaoOpenchatBody = {
  message?: string;
  text?: string;
  utterance?: string;
  room?: string;
  roomName?: string;
  sender?: string;
  userRequest?: {
    utterance?: string;
  };
};

type KakaoMessageContext = {
  roomName: string | null;
  sender: string | null;
};

function jsonReply(reply: string, status = 200, extra: Record<string, unknown> = {}) {
  // 카카오봇 Jsoup .post().text()는 400/404/500 응답에서 HttpStatusException을 던질 수 있습니다.
  // 봇 안정성을 위해 명령어 처리 결과는 HTTP 200으로 반환하고, 실제 상태는 ok/statusCode에 담습니다.
  return NextResponse.json(
    { ok: status >= 200 && status < 300, statusCode: status, reply, ...extra },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

function rejectIfInvalidSecret(req: NextRequest) {
  const secret = getRequiredSecretInProduction("KAKAO_OPENCHAT_SECRET");

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

function extractContext(body: KakaoOpenchatBody): KakaoMessageContext {
  return {
    roomName:
      typeof body.roomName === "string"
        ? body.roomName
        : typeof body.room === "string"
          ? body.room
          : null,
    sender: typeof body.sender === "string" ? body.sender : null,
  };
}

function getRecruitHelperLinkMessage() {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://k-lol-gg.vercel.app";

  return [
    "[K-LOL.GG 구인도우미]",
    "",
    "현재 사용 중인 카카오톡 명령어 전체 설명은 아래 페이지에서 확인해주세요.",
    "",
    `${baseUrl}/recruit-helper`,
    "",
    "구인현황 바로가기:",
    `${baseUrl}/recruit`,
  ].join("\n");
}

function normalizeKakaoText(value: string) {
  return String(value || "")
    .replace(/\r/g, "\n")
    .replace(/\u00A0/g, " ")
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0));
}

function isLikelyBotSender(sender: string | null) {
  const text = String(sender || "").trim();
  if (!text) return false;

  return /K-LOL|구인구직\s*도우미|구인도우미|오픈채팅봇|봇/i.test(text);
}

function isSeasonRecruitSnapshotMessage(message: string) {
  const text = normalizeKakaoText(message);
  const numberedLines = text
    .split("\n")
    .filter((line) => /^\s*(?:[1-9]|10|예비\s*\d{1,2})\s*[.)]/.test(line.trim()));

  if (numberedLines.length < 3) return false;

  return (
    /참가\s*신청\s*양식|협곡\s*내전|협곡내전|내전하실분/.test(text) &&
    /^\s*1\s*[.)]/m.test(text)
  );
}

function getSelfBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) return `https://${vercelUrl.replace(/\/$/, "")}`;

  return "http://localhost:3000";
}

async function forwardSeasonRecruitSnapshot(message: string, context: KakaoMessageContext) {
  const parsed = parseRecruitMessage(message);

  if (parsed.participants.length < 1) {
    return jsonReply([
      "[K-LOL.GG 내전 명단 업데이트 실패]",
      "참가자 이름이 1명 이상 있는 전체 양식만 반영할 수 있습니다.",
    ].join("\n"));
  }

  const recruitSecret = process.env.KAKAO_RECRUIT_SECRET?.trim();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (recruitSecret) {
    headers["x-kakao-recruit-secret"] = recruitSecret;
  }

  const response = await fetch(`${getSelfBaseUrl()}/api/kakao/recruit/season-apply`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      message,
      roomName: context.roomName,
      room: context.roomName,
      sender: context.sender,
    }),
    cache: "no-store",
  });

  const data = await response.json().catch(() => null) as { reply?: unknown; [key: string]: unknown } | null;
  const reply = typeof data?.reply === "string" && data.reply.trim()
    ? data.reply
    : "[K-LOL.GG 내전 명단 업데이트 실패]\nseason-apply 응답을 읽지 못했습니다.";

  return jsonReply(reply, response.ok ? 200 : 500, {
    forwardedTo: "season-apply",
    seasonApplyStatusCode: data?.statusCode ?? response.status,
  });
}

async function handleMessage(message: string, context: KakaoMessageContext = { roomName: null, sender: null }) {
  const trimmedMessage = message.trim();

  if (isSeasonRecruitSnapshotMessage(trimmedMessage) && !isLikelyBotSender(context.sender)) {
    return forwardSeasonRecruitSnapshot(trimmedMessage, context);
  }

  if (/^(구인도우미|\/구인도우미|구인웹도우미|\/구인웹도우미|구인매뉴얼|\/구인매뉴얼|명령어페이지|\/명령어페이지)$/i.test(trimmedMessage)) {
    return jsonReply(getRecruitHelperLinkMessage());
  }

  if (/^(AI공지|자동공지|공지생성)(\s+(12|15|18|20))?$/i.test(trimmedMessage)) {
    return jsonReply([
      "[명령어 변경 안내]",
      "AI공지는 내전현황으로 변경되었습니다.",
      "앞으로는 내전현황을 입력해주세요.",
    ].join("\n"));
  }

  if (/^(내전현황|\/내전현황|시즌내전현황|\/시즌내전현황)$/i.test(trimmedMessage)) {
    return jsonReply([
      "[내전현황 안내]",
      "내전현황은 LOL-K방 전용 카카오봇에서 처리합니다.",
      "카카오봇 코드가 최신인지 확인해주세요.",
    ].join("\n"));
  }

  const command = parseKakaoCommand(message);

  if (command.type === "help") {
    return jsonReply(getKakaoHelpMessage());
  }

  if (command.type === "recruitHelp") {
    return jsonReply(getKakaoRecruitHelpMessage());
  }

  if (command.type === "status") {
    return jsonReply([
      "[K-LOL.GG 내전현황 안내]",
      "내전현황은 카카오봇에서 /api/kakao/recruit/season-apply/status 또는 /api/kakao/scheduled-notice로 연결해야 최신 현황이 출력됩니다.",
      "카카오봇 스크립트의 내전현황 분기와 API_URL을 확인해주세요.",
    ].join("\n"));
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
      ].join("\n"));
    }

    const record = await getPlayerRecordForKakao(command.query);

    if (!record) {
      return jsonReply([
        "검색 결과가 없습니다.",
        "닉네임#태그를 확인해주세요.",
        "",
        "예시: 전적 sax0ph0ne#99단굵묵"
      ].join("\n"));
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
    if (rateLimitRejected) return jsonReply("요청이 너무 많습니다. 잠시 후 다시 시도해주세요.");

    const body = (await req.json().catch(() => ({}))) as KakaoOpenchatBody;
    return handleMessage(extractMessage(body), extractContext(body));
  } catch (error) {
    logServerError("[KAKAO_OPENCHAT_POST_ERROR]", error, { endpoint: "/api/kakao/openchat", method: "POST" });

    return jsonReply([
      "전적 조회 중 오류가 발생했습니다.",
      "잠시 후 다시 시도해주세요.",
    ].join("\n"));
  }
}

export async function GET(req: NextRequest) {
  try {
    const secretRejected = rejectIfInvalidSecret(req);
    if (secretRejected) return secretRejected;

    const rateLimitRejected = await rejectIfRateLimited(req, {
      action: "KAKAO_OPENCHAT",
      limit: 60,
      windowSeconds: 60,
    });
    if (rateLimitRejected) return jsonReply("요청이 너무 많습니다. 잠시 후 다시 시도해주세요.");

    const message = req.nextUrl.searchParams.get("message") ?? "도움말";
    return handleMessage(message);
  } catch (error) {
    logServerError("[KAKAO_OPENCHAT_GET_ERROR]", error, { endpoint: "/api/kakao/openchat", method: "GET" });
    return jsonReply([
      "전적 조회 중 오류가 발생했습니다.",
      "잠시 후 다시 시도해주세요.",
    ].join("\n"));
  }
}
