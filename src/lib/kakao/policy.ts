import type { KakaoOperationSettings } from "@/lib/kakao/settings";

export type KakaoPolicyFeature =
  | "GENERAL"
  | "RECRUIT_CREATE"
  | "RECRUIT_JOIN"
  | "RECRUIT_FINISH"
  | "RECRUIT_STATUS"
  | "SEASON_APPLY"
  | "SEASON_STATUS"
  | "PLAYER_SEARCH"
  | "OPERATION_FORM"
  | "DISCIPLINE_FORM"
  | "DISCIPLINE_STATUS"
  | "DISCIPLINE_EVIDENCE"
  | "INHOUSE_RESULT_FORM"
  | "INHOUSE_RESULT_IMAGE";

export type KakaoPolicyResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "GLOBAL_DISABLED"
        | "MAINTENANCE"
        | "MISSING_ROOM"
        | "MISSING_SENDER"
        | "ROOM_BLOCKED"
        | "SENDER_BLOCKED"
        | "BOT_SENDER"
        | "FEATURE_DISABLED";
      status: 400 | 403 | 503;
      message: string;
    };

function identity(value: string | null | undefined) {
  return String(value ?? "").trim().toLocaleLowerCase("ko-KR");
}

function exactMatch(value: string | null | undefined, candidates: string[]) {
  const normalized = identity(value);
  return Boolean(normalized) && candidates.some((item) => identity(item) === normalized);
}

function includesPattern(value: string | null | undefined, patterns: string[]) {
  const normalized = identity(value);
  return Boolean(normalized) && patterns.some((pattern) => {
    const target = identity(pattern);
    return Boolean(target) && normalized.includes(target);
  });
}

function isFeatureEnabled(settings: KakaoOperationSettings, feature: KakaoPolicyFeature) {
  switch (feature) {
    case "RECRUIT_CREATE":
      return settings.recruitCommandEnabled && settings.recruitCreateCommandEnabled;
    case "RECRUIT_JOIN":
      return settings.recruitCommandEnabled && settings.recruitJoinCommandEnabled;
    case "RECRUIT_FINISH":
      return settings.recruitCommandEnabled && settings.recruitFinishCommandEnabled;
    case "RECRUIT_STATUS":
      return settings.recruitCommandEnabled && settings.recruitStatusCommandEnabled;
    case "SEASON_APPLY":
      return settings.seasonApplyCommandEnabled && settings.seasonSnapshotForwardEnabled;
    case "SEASON_STATUS":
      return settings.seasonApplyCommandEnabled && settings.seasonStatusCommandEnabled;
    case "PLAYER_SEARCH":
      return settings.playerRecordSearchEnabled;
    case "OPERATION_FORM":
      return settings.operationFormsEnabled;
    case "DISCIPLINE_FORM":
      return settings.disciplineFormEnabled;
    case "DISCIPLINE_STATUS":
      return settings.disciplineStatusEnabled;
    case "DISCIPLINE_EVIDENCE":
      return settings.disciplineEvidenceEnabled;
    case "INHOUSE_RESULT_FORM":
      return settings.inhouseResultFormEnabled;
    case "INHOUSE_RESULT_IMAGE":
      return settings.inhouseResultImageEnabled;
    default:
      return true;
  }
}

function featureRooms(settings: KakaoOperationSettings, feature: KakaoPolicyFeature) {
  if (feature === "DISCIPLINE_FORM" || feature === "DISCIPLINE_STATUS" || feature === "DISCIPLINE_EVIDENCE") {
    return settings.allowedDisciplineRooms;
  }
  if (feature === "INHOUSE_RESULT_FORM" || feature === "INHOUSE_RESULT_IMAGE") {
    return settings.allowedInhouseResultRooms;
  }
  return [];
}

export function isKakaoOperatorSender(settings: KakaoOperationSettings, sender: string | null | undefined) {
  return exactMatch(sender, settings.operatorSenderNames);
}

export function isSameKakaoIdentity(a: string | null | undefined, b: string | null | undefined) {
  const first = identity(a);
  return Boolean(first) && first === identity(b);
}

export function canAccessKakaoOwnedResource(
  settings: KakaoOperationSettings,
  input: {
    resourceRoomName?: string | null;
    resourceSender?: string | null;
    roomName?: string | null;
    sender?: string | null;
  },
) {
  if (isKakaoOperatorSender(settings, input.sender)) return true;
  return isSameKakaoIdentity(input.resourceRoomName, input.roomName)
    && isSameKakaoIdentity(input.resourceSender, input.sender);
}

export function evaluateKakaoRequestPolicy(
  settings: KakaoOperationSettings,
  input: {
    feature: KakaoPolicyFeature;
    roomName?: string | null;
    sender?: string | null;
    requireRoom?: boolean;
    requireSender?: boolean;
  },
): KakaoPolicyResult {
  const roomName = String(input.roomName ?? "").trim();
  const sender = String(input.sender ?? "").trim();

  if (!settings.globalEnabled) {
    return { ok: false, reason: "GLOBAL_DISABLED", status: 503, message: settings.disabledFeatureMessage };
  }
  if (settings.maintenanceMode) {
    return { ok: false, reason: "MAINTENANCE", status: 503, message: settings.maintenanceMessage };
  }
  if (input.requireRoom && !roomName) {
    return { ok: false, reason: "MISSING_ROOM", status: 400, message: "[K-LOL.GG]\n방 정보를 확인할 수 없습니다. 카카오톡 방에서 다시 시도해주세요." };
  }
  if (input.requireSender && !sender) {
    return { ok: false, reason: "MISSING_SENDER", status: 400, message: "[K-LOL.GG]\n보낸 사람 정보를 확인할 수 없습니다. 다시 시도해주세요." };
  }
  if (roomName && includesPattern(roomName, settings.blockedRoomNames)) {
    return { ok: false, reason: "ROOM_BLOCKED", status: 403, message: settings.blockedRoomMessage };
  }
  if (roomName && settings.allowedRoomNames.length > 0 && !exactMatch(roomName, settings.allowedRoomNames)) {
    return { ok: false, reason: "ROOM_BLOCKED", status: 403, message: settings.blockedRoomMessage };
  }
  const allowedFeatureRooms = featureRooms(settings, input.feature);
  if (roomName && allowedFeatureRooms.length > 0 && !exactMatch(roomName, allowedFeatureRooms)) {
    return { ok: false, reason: "ROOM_BLOCKED", status: 403, message: settings.blockedRoomMessage };
  }
  if (sender && includesPattern(sender, settings.blockedSenders)) {
    return { ok: false, reason: "SENDER_BLOCKED", status: 403, message: settings.blockedRoomMessage };
  }
  if (sender && settings.ignoreBotSender && includesPattern(sender, settings.botSenderPatterns)) {
    return { ok: false, reason: "BOT_SENDER", status: 403, message: "" };
  }
  if (!isFeatureEnabled(settings, input.feature)) {
    return { ok: false, reason: "FEATURE_DISABLED", status: 403, message: settings.disabledFeatureMessage };
  }
  return { ok: true };
}

export function evaluatePartyMutationOwnership(
  settings: KakaoOperationSettings,
  input: {
    partyRoomName?: string | null;
    partyHostName?: string | null;
    roomName?: string | null;
    sender?: string | null;
    operatorOverride?: boolean;
  },
):
  | { ok: true; operatorOverride: boolean }
  | {
      ok: false;
      reason: "ROOM_MISMATCH" | "HOST_MISMATCH";
      message: string;
    } {
  // 구인은 허용된 카카오톡 방 구성원이 함께 갱신하는 공동 상태다.
  // 웹훅 인증과 설정된 방/발신자 정책은 이 판정 전에 검증되므로 최초 작성자나
  // 생성 당시 저장된 방 이름을 기준으로 수정·마감을 다시 제한하지 않는다.
  const operatorOverride =
    Boolean(input.operatorOverride) && isKakaoOperatorSender(settings, input.sender);

  return { ok: true as const, operatorOverride };
}
