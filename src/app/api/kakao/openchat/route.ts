import { requireSiteFeature } from "@/lib/site/feature-guard";
import { NextRequest, NextResponse } from "next/server";
import { rejectIfRateLimited } from "@/lib/rate-limit";
import { getRequiredSecretInProduction, matchesRequestSecret } from "@/lib/security/secrets";
import { getKakaoHelpMessage, getKakaoRecruitHelpMessage, parseKakaoCommand } from "@/lib/kakao/parseKakaoCommand";
import {
  formatPlayerRecordMessage,
  formatRecentGamesMessage,
} from "@/lib/kakao/formatPlayerRecordMessage";
import {
  getPlayerRecordForKakao,
  getRankingForKakao,
} from "@/features/player/services/getPlayerRecordForKakao";
import { logServerError } from "@/lib/server/safe-log";
import { getKakaoOperationSettings, type KakaoOperationSettings } from "@/lib/kakao/settings";

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

type RankingRow = { nickname: string; tag: string; winRate: number; totalGames: number; participationCount: number; kda: number };

function formatNumber(value: number, digits = 1) {
  if (!Number.isFinite(value)) return "0";
  return value.toFixed(digits);
}

function formatKda(value: number) {
  if (!Number.isFinite(value)) return "Perfect";
  return value.toFixed(2);
}

function applyPrefix(reply: string, settings: KakaoOperationSettings) {
  const prefix = settings.responsePrefix?.trim();
  if (!prefix) return reply;
  if (!reply.trim()) return reply;
  if (reply.startsWith(prefix)) return reply;
  return `${prefix}\n${reply}`;
}

function jsonReply(reply: string, status = 200, extra: Record<string, unknown> = {}, settings?: KakaoOperationSettings) {
  const finalReply = settings ? applyPrefix(reply, settings) : reply;
  return NextResponse.json(
    { ok: status >= 200 && status < 300, statusCode: status, reply: finalReply, ...extra },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

function disabledReply(settings: KakaoOperationSettings, feature?: string) {
  const suffix = feature ? `\n대상 기능: ${feature}` : "";
  return jsonReply(`${settings.disabledFeatureMessage}${suffix}`, 200, {}, settings);
}

function rejectIfInvalidSecret(req: NextRequest) {
  const secret = getRequiredSecretInProduction("KAKAO_OPENCHAT_SECRET");

  if (!secret) return null;

  const headerSecret = req.headers.get("x-kakao-openchat-secret");
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (
    matchesRequestSecret(secret, {
      headers: [headerSecret],
      bearer,
    })
  ) {
    return null;
  }

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

function getSelfBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) return `https://${vercelUrl.replace(/\/$/, "")}`;

  return "http://localhost:3000";
}

function getRecruitHelperLinkMessage(settings: KakaoOperationSettings) {
  const baseUrl = getSelfBaseUrl();

  return [
    settings.helperLinkTitle,
    "",
    "현재 사용 중인 카카오톡 구인 관련 설명은 아래 페이지에서 확인해주세요.",
    "",
    `${baseUrl}${settings.recruitHelperPath}`,
    "",
    "구인현황 바로가기:",
    `${baseUrl}${settings.recruitPagePath}`,
  ].join("\n");
}

function normalizeKakaoText(value: string) {
  return String(value || "")
    .replace(/\r/g, "\n")
    .replace(/\u00A0/g, " ")
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0));
}

function includesAny(value: string | null, patterns: string[]) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return false;
  return patterns.some((pattern) => text.includes(pattern.toLowerCase()));
}

function isLikelyBotSender(sender: string | null, settings: KakaoOperationSettings) {
  return includesAny(sender, settings.botSenderPatterns);
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

function isRoomAllowed(context: KakaoMessageContext, settings: KakaoOperationSettings) {
  const roomName = context.roomName || settings.defaultRoomName || "";

  if (includesAny(roomName, settings.blockedRoomNames)) return false;
  if (settings.allowedRoomNames.length > 0 && !includesAny(roomName, settings.allowedRoomNames)) return false;
  return true;
}

function isSenderBlocked(context: KakaoMessageContext, settings: KakaoOperationSettings) {
  if (includesAny(context.sender, settings.blockedSenders)) return true;
  if (settings.ignoreBotSender && isLikelyBotSender(context.sender, settings)) return true;
  return false;
}

function formatRankingMessageWithLimit(rows: RankingRow[], limit: number) {
  if (!rows.length) {
    return "랭킹 데이터가 없습니다.\n기준: 내전 참여 10회 이상";
  }

  return [
    `🏆 K-LOL.GG 랭킹 TOP ${limit}`,
    "기준: 내전 참여 10회 이상",
    "",
    ...rows.slice(0, limit).map((row, index) => {
      return `${index + 1}. ${row.nickname}#${row.tag} | 승률 ${formatNumber(row.winRate)}% | 참여 ${row.participationCount}회 | ${row.totalGames}세트 | KDA ${formatKda(row.kda)}`;
    }),
  ].join("\n");
}

async function forwardSeasonRecruitSnapshot(message: string, context: KakaoMessageContext, settings: KakaoOperationSettings) {
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

  return jsonReply(reply, response.ok ? 200 : response.status, {
    forwardedTo: "season-apply",
    seasonApplyStatusCode: data?.statusCode ?? response.status,
  }, settings);
}

async function handleMessage(message: string, context: KakaoMessageContext = { roomName: null, sender: null }, settings: KakaoOperationSettings) {
  const trimmedMessage = message.trim();

  if (!settings.globalEnabled || settings.maintenanceMode) {
    return jsonReply(settings.maintenanceMessage, 200, { reason: "maintenance" }, settings);
  }

  if (!trimmedMessage) {
    return jsonReply(settings.unknownCommandMessage || getKakaoHelpMessage(), 200, {}, settings);
  }

  if (trimmedMessage.length > settings.maxMessageLength) {
    return jsonReply("[K-LOL.GG]\n메시지가 너무 길어 처리하지 않았습니다.", 200, {}, settings);
  }

  if (!isRoomAllowed(context, settings)) {
    return jsonReply(settings.blockedRoomMessage, 200, { reason: "room_blocked" }, settings);
  }

  if (isSenderBlocked(context, settings)) {
    return jsonReply("", 200, { reason: "sender_ignored" }, settings);
  }

  if (isSeasonRecruitSnapshotMessage(trimmedMessage)) {
    if (!settings.seasonApplyCommandEnabled || !settings.seasonSnapshotForwardEnabled) return disabledReply(settings, "내전 명단 자동 반영");
    return forwardSeasonRecruitSnapshot(trimmedMessage, context, settings);
  }

  if (/^(구인도우미|\/구인도우미|구인웹도우미|\/구인웹도우미|구인매뉴얼|\/구인매뉴얼|명령어페이지|\/명령어페이지)$/i.test(trimmedMessage)) {
    if (!settings.recruitCommandEnabled || !settings.recruitHelpCommandEnabled) return disabledReply(settings, "구인 도움말");
    return jsonReply(getRecruitHelperLinkMessage(settings), 200, {}, settings);
  }

  if (/^(AI공지|자동공지|공지생성)(\s+(12|15|18|20))?$/i.test(trimmedMessage)) {
    if (!settings.aiNoticeRedirectEnabled) return disabledReply(settings, "AI공지 호환 안내");
    return jsonReply([
      "[명령어 변경 안내]",
      "AI공지는 내전현황으로 변경되었습니다.",
      "앞으로는 내전현황을 입력해주세요.",
    ].join("\n"), 200, {}, settings);
  }

  if (/^(내전현황|\/내전현황|시즌내전현황|\/시즌내전현황)$/i.test(trimmedMessage)) {
    if (!settings.seasonApplyCommandEnabled || !settings.seasonStatusCommandEnabled) return disabledReply(settings, "내전현황");
    return jsonReply([
      "[K-LOL.GG 내전현황 안내]",
      "내전현황은 카카오봇에서 /api/kakao/recruit/season-apply/status 또는 /api/kakao/scheduled-notice로 연결해야 최신 현황이 출력됩니다.",
      "카카오봇 스크립트의 내전현황 분기와 API_URL을 확인해주세요.",
    ].join("\n"), 200, {}, settings);
  }

  const command = parseKakaoCommand(message);

  if (command.type === "help") {
    if (!settings.helpCommandEnabled || !settings.unknownCommandResponseEnabled) return jsonReply("", 200, {}, settings);
    return jsonReply(settings.unknownCommandMessage || getKakaoHelpMessage(), 200, {}, settings);
  }

  if (command.type === "recruitHelp") {
    if (!settings.recruitCommandEnabled || !settings.recruitHelpCommandEnabled) return disabledReply(settings, "구인 도움말");
    return jsonReply(getKakaoRecruitHelpMessage(), 200, {}, settings);
  }

  if (command.type === "status") {
    if (!settings.seasonApplyCommandEnabled || !settings.seasonStatusCommandEnabled) return disabledReply(settings, "내전현황");
    return jsonReply([
      "[K-LOL.GG 내전현황 안내]",
      "내전현황은 카카오봇에서 /api/kakao/recruit/season-apply/status 또는 /api/kakao/scheduled-notice로 연결해야 최신 현황이 출력됩니다.",
      "카카오봇 스크립트의 내전현황 분기와 API_URL을 확인해주세요.",
    ].join("\n"), 200, {}, settings);
  }

  if (command.type === "ranking") {
    if (!settings.playerRecordSearchEnabled || !settings.rankingCommandEnabled) return disabledReply(settings, "랭킹 조회");
    const rows = await getRankingForKakao();
    return jsonReply(formatRankingMessageWithLimit(rows, settings.rankingLimit), 200, {}, settings);
  }

  if (command.type === "record" || command.type === "recent") {
    if (!settings.playerRecordSearchEnabled) return disabledReply(settings, "전적 조회");
    if (command.type === "record" && !settings.recordCommandEnabled) return disabledReply(settings, "전적 조회");
    if (command.type === "recent" && !settings.recentCommandEnabled) return disabledReply(settings, "최근 경기 조회");

    if (!command.query) {
      return jsonReply([
        "닉네임#태그 형식으로 입력해주세요.",
        "",
        "예시: 전적 sax0ph0ne#99단굵묵"
      ].join("\n"), 200, {}, settings);
    }

    const record = await getPlayerRecordForKakao(command.query);

    if (!record) {
      return jsonReply([
        settings.notFoundMessage,
        "",
        "예시: 전적 sax0ph0ne#99단굵묵"
      ].join("\n"), 200, {}, settings);
    }

    const limitedRecord = {
      ...record,
      recentGames: record.recentGames.slice(0, command.type === "recent" ? settings.recentGamesLimit : Math.min(settings.recentGamesLimit, 5)),
    };

    return jsonReply(
      command.type === "recent"
        ? formatRecentGamesMessage(limitedRecord)
        : formatPlayerRecordMessage(limitedRecord),
      200,
      {},
      settings,
    );
  }

  if (!settings.unknownCommandResponseEnabled) return jsonReply("", 200, {}, settings);
  return jsonReply(settings.unknownCommandMessage || getKakaoHelpMessage(), 200, {}, settings);
}

async function getSettingsAndRejectRateLimit(req: NextRequest) {
  const settings = await getKakaoOperationSettings();
  const rateLimitRejected = await rejectIfRateLimited(req, {
    action: "KAKAO_OPENCHAT",
    limit: settings.openchatRateLimitPerMinute,
    windowSeconds: settings.openchatRateLimitWindowSeconds,
  });

  return { settings, rateLimitRejected };
}

export async function POST(req: NextRequest) {
  const premiumLock = await requireSiteFeature("kakao");
  if (premiumLock) return premiumLock;

  let settings: KakaoOperationSettings | null = null;

  try {
    const secretRejected = rejectIfInvalidSecret(req);
    if (secretRejected) return secretRejected;

    const rateLimit = await getSettingsAndRejectRateLimit(req);
    settings = rateLimit.settings;
    if (rateLimit.rateLimitRejected) return jsonReply("요청이 너무 많습니다. 잠시 후 다시 시도해주세요.", 200, {}, settings);

    const body = (await req.json().catch(() => ({}))) as KakaoOpenchatBody;
    return handleMessage(extractMessage(body), extractContext(body), settings);
  } catch (error) {
    logServerError("[KAKAO_OPENCHAT_POST_ERROR]", error, { endpoint: "/api/kakao/openchat", method: "POST" });

    return jsonReply(settings?.errorMessage || "처리 중 오류가 발생했습니다.\n잠시 후 다시 시도해주세요.", 200, {}, settings ?? undefined);
  }
}

export async function GET(req: NextRequest) {
  const premiumLock = await requireSiteFeature("kakao");
  if (premiumLock) return premiumLock;

  let settings: KakaoOperationSettings | null = null;

  try {
    const secretRejected = rejectIfInvalidSecret(req);
    if (secretRejected) return secretRejected;

    const rateLimit = await getSettingsAndRejectRateLimit(req);
    settings = rateLimit.settings;
    if (rateLimit.rateLimitRejected) return jsonReply("요청이 너무 많습니다. 잠시 후 다시 시도해주세요.", 200, {}, settings);

    const message = req.nextUrl.searchParams.get("message") ?? "도움말";
    const context: KakaoMessageContext = {
      roomName: req.nextUrl.searchParams.get("roomName") ?? req.nextUrl.searchParams.get("room"),
      sender: req.nextUrl.searchParams.get("sender"),
    };
    return handleMessage(message, context, settings);
  } catch (error) {
    logServerError("[KAKAO_OPENCHAT_GET_ERROR]", error, { endpoint: "/api/kakao/openchat", method: "GET" });
    return jsonReply(settings?.errorMessage || "처리 중 오류가 발생했습니다.\n잠시 후 다시 시도해주세요.", 200, {}, settings ?? undefined);
  }
}
