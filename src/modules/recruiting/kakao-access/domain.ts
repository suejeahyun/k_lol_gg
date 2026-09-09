export const KAKAO_ROOM_STATUSES = ["ACTIVE", "PAUSED", "REVOKED"] as const;
export type KakaoRoomStatus = (typeof KAKAO_ROOM_STATUSES)[number];
export const KAKAO_ROOM_MEMBER_ROLES = ["MEMBER", "MANAGER", "ADMIN"] as const;
export type KakaoRoomMemberRole = (typeof KAKAO_ROOM_MEMBER_ROLES)[number];

export type KakaoCommandCapability = "MEMBER" | "OWNER_OR_MANAGER" | "ADMIN" | "SUPER" | "INSTALLATION_INTERNAL";

export const KAKAO_COMMAND_CAPABILITY = Object.freeze({
  PLAYER_QUERY: "MEMBER",
  PARTY_CREATE: "MEMBER",
  PARTY_STATUS: "MEMBER",
  SCRIM_CREATE: "MEMBER",
  SCRIM_JOIN: "MEMBER",
  INHOUSE_SYNC: "MEMBER",
  INHOUSE_STATUS: "MEMBER",
  OPERATION_FORM_SUBMIT: "MEMBER",
  PARTY_SYNC: "OWNER_OR_MANAGER",
  PARTY_FINISH: "OWNER_OR_MANAGER",
  SCRIM_SYNC: "OWNER_OR_MANAGER",
  SCRIM_CONFIRM: "OWNER_OR_MANAGER",
  SCRIM_COMPLETE: "OWNER_OR_MANAGER",
  PARTY_FORCE_CANCEL: "ADMIN",
  SCRIM_FORCE_CANCEL: "ADMIN",
  SCRIM_REOPEN: "ADMIN",
  INHOUSE_FORCE_CANCEL: "ADMIN",
  OPERATION_FORM_REVIEW: "ADMIN",
  OPERATION_FORM_DELETE: "ADMIN",
  ROOM_REGISTER: "SUPER",
  ROOM_STATUS: "SUPER",
  MEMBER_ROLE: "SUPER",
  SETTINGS: "SUPER",
  LOGS: "SUPER",
  RAW_V2_JSON: "INSTALLATION_INTERNAL",
} as const satisfies Readonly<Record<string, KakaoCommandCapability>>);

export type KakaoRoomAccessFailure = "ROOM_BINDING_REQUIRED" | "ROOM_NOT_REGISTERED" | "ROOM_PAUSED" | "ROLE_FORBIDDEN" | "REGISTRY_UNAVAILABLE";

export function kakaoRoleAtLeast(actual: KakaoRoomMemberRole, required: KakaoRoomMemberRole) {
  const rank = { MEMBER: 0, MANAGER: 1, ADMIN: 2 } as const;
  return rank[actual] >= rank[required];
}

export function requiredRoomRole(capability: KakaoCommandCapability): KakaoRoomMemberRole | null {
  if (capability === "MEMBER") return "MEMBER";
  if (capability === "OWNER_OR_MANAGER") return "MANAGER";
  if (capability === "ADMIN") return "ADMIN";
  return null;
}

export function isKakaoFingerprint(value: string, prefix: "room" | "sender" | "install") {
  if (prefix === "sender") return /^sender-(?:user-|display-)?[a-f0-9]{32}$/u.test(value);
  return new RegExp(`^${prefix}-[a-f0-9]{32}$`, "u").test(value);
}

export function isStableKakaoSenderFingerprint(value: string) {
  return /^sender-(?:user-)?[a-f0-9]{32}$/u.test(value);
}

export function parsePairingCode(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFKC").trim().toUpperCase();
  return /^[A-HJ-NP-Z2-9]{8}$/u.test(normalized) ? normalized : null;
}
