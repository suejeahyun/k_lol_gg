import { canonicalKakaoV4CommandText, type KakaoV4ProfileId } from "./domain";

export const KAKAO_V4_COMMAND_FAMILIES = ["PARTY", "INHOUSE", "SCRIM", "PLAYER", "OPERATIONS", "LOCAL"] as const;
export type KakaoV4CommandFamily = (typeof KAKAO_V4_COMMAND_FAMILIES)[number];

export const KAKAO_V4_CANONICAL_COMMANDS = [
  "LOCAL_BOT_VERSION",
  "LOCAL_USER_HELP",
  "LOCAL_RECRUIT_HELP",
  "LOCAL_RECRUIT_WEB_HELP",
  "LOCAL_INTERNAL_HELP",
  "LOCAL_INTERNAL_DIAGNOSTIC",
  "LOCAL_LINK_CHECK",
  "LOCAL_V4_STATUS",
  "LOCAL_V4_CONTRACT",
  "LOCAL_RAW_RECRUIT",
  "LOCAL_RAW_SEASON",
  "LOCAL_RAW_OPERATION_FORM",
  "LOCAL_RAW_PHOTO_SESSION",
  "PARTY_CREATE",
  "PARTY_STATUS",
  "PARTY_DETAIL",
  "PARTY_FINISH",
  "PARTY_SNAPSHOT",
  "INHOUSE_CREATE",
  "INHOUSE_STATUS",
  "INHOUSE_DETAIL",
  "INHOUSE_JOIN_GUIDE",
  "INHOUSE_SNAPSHOT",
  "SCRIM_CREATE",
  "SCRIM_STATUS",
  "SCRIM_DETAIL",
  "SCRIM_LEGACY_JOIN",
  "SCRIM_LEGACY_CONFIRM",
  "SCRIM_LEGACY_CANCEL",
  "SCRIM_LEGACY_FINISH",
  "SCRIM_SNAPSHOT",
  "PLAYER_RECORD",
  "PLAYER_RECENT",
  "PLAYER_RANKING",
  "OPERATIONS_REGISTRATION_HUB",
  "OPERATIONS_INHOUSE_RESULT",
  "OPERATIONS_INHOUSE_RESULT_STATUS",
  "OPERATIONS_DISCIPLINE_CREATE",
  "OPERATIONS_DISCIPLINE_EVIDENCE",
  "OPERATIONS_DISCIPLINE_STATUS",
  "OPERATIONS_PHOTO_STATUS",
  "OPERATIONS_PHOTO_CANCEL",
  "OPERATIONS_INHOUSE_PREVIEW_CANCEL",
  "OPERATIONS_INHOUSE_CONFIRM",
  "OPERATIONS_SCHEDULE_NOTICE",
  "OPERATIONS_FORM_SUBMIT",
] as const;
export type KakaoV4CommandId = (typeof KAKAO_V4_CANONICAL_COMMANDS)[number];

type KakaoV4CommandAudience = "USER" | "INTERNAL";
type KakaoV4CommandParameters = Readonly<Record<string, string | number | boolean | null>>;

type KakaoV4RecognizedCommand = Readonly<{
  kind: "COMMAND" | "SNAPSHOT";
  family: KakaoV4CommandFamily;
  command: KakaoV4CommandId;
  canonicalText: string;
  allowedProfiles: readonly KakaoV4ProfileId[];
  audience: KakaoV4CommandAudience;
  parameters: KakaoV4CommandParameters;
}>;

export type KakaoV4CommandClassification =
  | KakaoV4RecognizedCommand
  | Readonly<{
      kind: "WRONG_PROFILE";
      family: KakaoV4CommandFamily;
      command: KakaoV4CommandId;
      canonicalText: string;
      allowedProfiles: readonly KakaoV4ProfileId[];
      audience: KakaoV4CommandAudience;
      parameters: KakaoV4CommandParameters;
    }>
  | Readonly<{
      kind: "UNKNOWN";
      canonicalText: string | null;
      reason: "EMPTY" | "SLASH_BOUNDARY" | "NO_MATCH";
    }>;

const RECRUIT_ONLY = Object.freeze(["RECRUIT"] as const);
const FEATURES_ONLY = Object.freeze(["FEATURES"] as const);
const BOTH_PROFILES = Object.freeze(["RECRUIT", "FEATURES"] as const);

const COMMAND_PROFILE_MATRIX = Object.freeze({
  LOCAL_BOT_VERSION: BOTH_PROFILES,
  LOCAL_USER_HELP: BOTH_PROFILES,
  LOCAL_RECRUIT_HELP: RECRUIT_ONLY,
  LOCAL_RECRUIT_WEB_HELP: RECRUIT_ONLY,
  LOCAL_INTERNAL_HELP: BOTH_PROFILES,
  LOCAL_INTERNAL_DIAGNOSTIC: BOTH_PROFILES,
  LOCAL_LINK_CHECK: BOTH_PROFILES,
  LOCAL_V4_STATUS: BOTH_PROFILES,
  LOCAL_V4_CONTRACT: BOTH_PROFILES,
  LOCAL_RAW_RECRUIT: RECRUIT_ONLY,
  LOCAL_RAW_SEASON: FEATURES_ONLY,
  LOCAL_RAW_OPERATION_FORM: FEATURES_ONLY,
  LOCAL_RAW_PHOTO_SESSION: FEATURES_ONLY,
  PARTY_CREATE: RECRUIT_ONLY,
  PARTY_STATUS: RECRUIT_ONLY,
  PARTY_DETAIL: RECRUIT_ONLY,
  PARTY_FINISH: RECRUIT_ONLY,
  PARTY_SNAPSHOT: RECRUIT_ONLY,
  INHOUSE_CREATE: FEATURES_ONLY,
  INHOUSE_STATUS: FEATURES_ONLY,
  INHOUSE_DETAIL: FEATURES_ONLY,
  INHOUSE_JOIN_GUIDE: FEATURES_ONLY,
  INHOUSE_SNAPSHOT: FEATURES_ONLY,
  SCRIM_CREATE: RECRUIT_ONLY,
  SCRIM_STATUS: RECRUIT_ONLY,
  SCRIM_DETAIL: RECRUIT_ONLY,
  SCRIM_LEGACY_JOIN: RECRUIT_ONLY,
  SCRIM_LEGACY_CONFIRM: RECRUIT_ONLY,
  SCRIM_LEGACY_CANCEL: RECRUIT_ONLY,
  SCRIM_LEGACY_FINISH: RECRUIT_ONLY,
  SCRIM_SNAPSHOT: RECRUIT_ONLY,
  PLAYER_RECORD: FEATURES_ONLY,
  PLAYER_RECENT: FEATURES_ONLY,
  PLAYER_RANKING: FEATURES_ONLY,
  OPERATIONS_REGISTRATION_HUB: FEATURES_ONLY,
  OPERATIONS_INHOUSE_RESULT: FEATURES_ONLY,
  OPERATIONS_INHOUSE_RESULT_STATUS: FEATURES_ONLY,
  OPERATIONS_DISCIPLINE_CREATE: FEATURES_ONLY,
  OPERATIONS_DISCIPLINE_EVIDENCE: FEATURES_ONLY,
  OPERATIONS_DISCIPLINE_STATUS: FEATURES_ONLY,
  OPERATIONS_PHOTO_STATUS: FEATURES_ONLY,
  OPERATIONS_PHOTO_CANCEL: FEATURES_ONLY,
  OPERATIONS_INHOUSE_PREVIEW_CANCEL: FEATURES_ONLY,
  OPERATIONS_INHOUSE_CONFIRM: FEATURES_ONLY,
  OPERATIONS_SCHEDULE_NOTICE: FEATURES_ONLY,
  OPERATIONS_FORM_SUBMIT: FEATURES_ONLY,
} as const satisfies Readonly<Record<KakaoV4CommandId, readonly KakaoV4ProfileId[]>>);

function commandAllowsProfile(command: KakaoV4CommandId, profileId: KakaoV4ProfileId) {
  return (COMMAND_PROFILE_MATRIX[command] as readonly KakaoV4ProfileId[]).includes(profileId);
}

export const KAKAO_V4_PROFILE_COMMAND_MATRIX = Object.freeze({
  RECRUIT: Object.freeze(KAKAO_V4_CANONICAL_COMMANDS.filter((command) => commandAllowsProfile(command, "RECRUIT"))),
  FEATURES: Object.freeze(KAKAO_V4_CANONICAL_COMMANDS.filter((command) => commandAllowsProfile(command, "FEATURES"))),
} as const satisfies Readonly<Record<KakaoV4ProfileId, readonly KakaoV4CommandId[]>>);

function commandFamily(command: KakaoV4CommandId): KakaoV4CommandFamily {
  if (command.startsWith("PARTY_")) return "PARTY";
  if (command.startsWith("INHOUSE_")) return "INHOUSE";
  if (command.startsWith("SCRIM_")) return "SCRIM";
  if (command.startsWith("PLAYER_")) return "PLAYER";
  if (command.startsWith("OPERATIONS_")) return "OPERATIONS";
  return "LOCAL";
}

function recognized(
  command: KakaoV4CommandId,
  canonicalText: string,
  parameters: KakaoV4CommandParameters = Object.freeze({}),
  kind: "COMMAND" | "SNAPSHOT" = "COMMAND",
  audience: KakaoV4CommandAudience = "USER",
): KakaoV4RecognizedCommand {
  return Object.freeze({
    kind,
    family: commandFamily(command),
    command,
    canonicalText,
    allowedProfiles: COMMAND_PROFILE_MATRIX[command],
    audience,
    parameters: Object.freeze({ ...parameters }),
  });
}

function withProfile(result: KakaoV4RecognizedCommand, profileId: KakaoV4ProfileId): KakaoV4CommandClassification {
  if (commandAllowsProfile(result.command, profileId)) return result;
  return Object.freeze({ ...result, kind: "WRONG_PROFILE" as const });
}

function slashBoundaryReason(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return "EMPTY" as const;
  if (trimmed === "/" || trimmed.startsWith("//") || /^\/\s/u.test(trimmed)) return "SLASH_BOUNDARY" as const;
  return "NO_MATCH" as const;
}

function countFilledNumberedRows(text: string) {
  let count = 0;
  for (const line of text.split("\n")) {
    const numbered = /^\s*(?:예비\s*|후보\s*|대기\s*)?\d+\.\s*(.*?)\s*$/u.exec(line);
    const positioned = /^\s*(?:TOP|JUG|JGL|MID|ADC|SUP)\.\s*(.*?)\s*$/iu.exec(line);
    const value = numbered?.[1] ?? positioned?.[1];
    if (value) count += value.split(/\s*,\s*/u).filter(Boolean).length;
  }
  return count;
}

function classifySnapshot(text: string): KakaoV4RecognizedCommand | null {
  if (
    /^\s*\[K-LOL\.GG 스크림 구인 양식\]/u.test(text) &&
    /^\s*운영일\s*:/mu.test(text) &&
    /^\s*번호\s*:\s*#(?:자동배정|\d+)/mu.test(text) &&
    /^\s*우리팀\s*:/mu.test(text) &&
    /^\s*상대팀\s*:/mu.test(text)
  ) {
    const scrimNumber = /^\s*번호\s*:\s*#(\d+)/mu.exec(text)?.[1];
    return recognized("SCRIM_SNAPSHOT", text, { scrimNumber: scrimNumber ? Number(scrimNumber) : null }, "SNAPSHOT");
  }

  const inhouseNumber = /^\s*📢\s*내전하실분\s*#(\d+)\s*$/mu.exec(text)?.[1];
  if (inhouseNumber && /^\s*\*참가 신청 양식\*\s*$/mu.test(text) && /^\s*》\s*(?:협곡|칼바람|증바람|증강칼바람)\s*$/mu.test(text)) {
    const modeLabel = /^\s*》\s*(협곡|칼바람|증바람|증강칼바람)\s*$/mu.exec(text)?.[1] ?? "";
    const mode = modeLabel === "협곡" ? "RIFT" : modeLabel === "칼바람" ? "ARAM" : "AUGMENT_ARAM";
    return recognized("INHOUSE_SNAPSHOT", text, {
      recruitNumber: Number(inhouseNumber),
      mode,
      memberCount: countFilledNumberedRows(text),
    }, "SNAPSHOT");
  }

  const partyNumber = /^\s*모집번호\s*:\s*#(자동배정|\d+)\s*$/mu.exec(text)?.[1];
  if (partyNumber && /^\s*📢\s*.+(?:파티 구인|하실분!?)\s*$/mu.test(text)) {
    return recognized("PARTY_SNAPSHOT", text, {
      recruitNumber: partyNumber === "자동배정" ? null : Number(partyNumber),
      automaticRecruitNumber: partyNumber === "자동배정",
      memberCount: countFilledNumberedRows(text),
      startTimeOptional: true,
      gameInfoOptional: true,
    }, "SNAPSHOT");
  }

  const operationForm = classifyOperationForm(text);
  if (operationForm) return operationForm;
  return null;
}

function classifyOperationForm(text: string): KakaoV4RecognizedCommand | null {
  const hasAll = (labels: readonly string[]) => labels.every((label) => text.includes(label));
  if (hasAll(["지인 이름", "지인 닉네임", "이용기간", "디스코드 닉네임 변경"])) {
    return recognized("OPERATIONS_FORM_SUBMIT", text, { formType: "friends" });
  }
  if (hasAll(["본인 이름 및 닉네임", "건의 사유", "건의 내용"])) {
    return recognized("OPERATIONS_FORM_SUBMIT", text, { formType: "suggestions" });
  }
  if (hasAll(["주최자 이름 및 닉네임", "일자", "장소", "참여자 명단"])) {
    return recognized("OPERATIONS_FORM_SUBMIT", text, { formType: "meetups" });
  }
  if (hasAll(["이름 및 닉네임", "외출기간", "외출사유", "외출범위"])) {
    return recognized("OPERATIONS_FORM_SUBMIT", text, { formType: "leaves" });
  }
  return null;
}

function classifyLocal(text: string): KakaoV4RecognizedCommand | null {
  if (text === "봇버전") return recognized("LOCAL_BOT_VERSION", text);
  if (text === "도움말" || text === "명령어") return recognized("LOCAL_USER_HELP", text);
  if (["구인구직도움말", "구인도움말", "구인명령어"].includes(text)) return recognized("LOCAL_RECRUIT_HELP", text);
  if (["구인도우미", "구인웹도우미", "구인매뉴얼", "명령어페이지"].includes(text)) return recognized("LOCAL_RECRUIT_WEB_HELP", text);
  if (text === "V2도움말") return recognized("LOCAL_INTERNAL_HELP", text, {}, "COMMAND", "INTERNAL");
  if (text === "V2진단") return recognized("LOCAL_INTERNAL_DIAGNOSTIC", text, {}, "COMMAND", "INTERNAL");
  if (text === "V2연동확인" || text === "연동확인") return recognized("LOCAL_LINK_CHECK", text, {}, "COMMAND", "INTERNAL");
  if (text === "V4상태") return recognized("LOCAL_V4_STATUS", text, {}, "COMMAND", "INTERNAL");
  if (text === "V4계약확인") return recognized("LOCAL_V4_CONTRACT", text, {}, "COMMAND", "INTERNAL");
  if (/^V2모집\s+\S/u.test(text)) return recognized("LOCAL_RAW_RECRUIT", text, { rawPayload: text.slice("V2모집".length).trim() }, "COMMAND", "INTERNAL");
  if (/^V2시즌\s+\S/u.test(text)) return recognized("LOCAL_RAW_SEASON", text, { rawPayload: text.slice("V2시즌".length).trim() }, "COMMAND", "INTERNAL");
  if (/^V2양식\s+\S/u.test(text)) return recognized("LOCAL_RAW_OPERATION_FORM", text, { rawPayload: text.slice("V2양식".length).trim() }, "COMMAND", "INTERNAL");
  if (/^V2사진세션\s+\S/u.test(text)) return recognized("LOCAL_RAW_PHOTO_SESSION", text, { rawPayload: text.slice("V2사진세션".length).trim() }, "COMMAND", "INTERNAL");
  return null;
}

function classifyParty(text: string): KakaoV4RecognizedCommand | null {
  if (["현재구인구직현황", "현재구인현황", "구인구직현황", "구인현황", "현황"].includes(text)) {
    return recognized("PARTY_STATUS", text);
  }
  const detail = /^(?:구인상세|상세)\s*#?(\d+)$/u.exec(text);
  if (detail) return recognized("PARTY_DETAIL", text, { recruitNumber: Number(detail[1]) });

  const prefixFinish = /^구인(?:마감|쫑|종료)\s*#?(\d+)$/u.exec(text);
  const suffixFinish = /^#?(\d+)(?:번|인)?\s*(?:파티|구인)?\s*(?:쫑|ㅉ|마감|종료)$/u.exec(text);
  const finishNumber = prefixFinish?.[1] ?? suffixFinish?.[1];
  if (finishNumber) return recognized("PARTY_FINISH", text, { recruitNumber: Number(finishNumber) });

  const numbered = /^(\d+)인\s*(?:파티|구인)(?:\s+(\d+))?$/u.exec(text);
  if (numbered) return recognized("PARTY_CREATE", text, {
    partyType: "PARTY_NUMBER",
    maximumMembers: Number(numbered[1]),
    explicitRecruitNumber: numbered[2] ? Number(numbered[2]) : null,
  });
  const rift = /^5인\s*협곡(?:\s*파티)?(?:\s+(\d+))?$/u.exec(text);
  if (rift) return recognized("PARTY_CREATE", text, { partyType: "PARTY_RIFT", maximumMembers: 5, explicitRecruitNumber: rift[1] ? Number(rift[1]) : null });

  const named = /^(자랭|일반|솔랭|칼바람|증바람|기타게임|롤체일반|롤체랭크|더블업)구인(?:\s+(\d+))?$/u.exec(text);
  if (!named) return null;
  const types = {
    자랭: ["FLEX_RANK", 5], 일반: ["NORMAL_GAME", 5], 솔랭: ["SOLO_RANK", 2],
    칼바람: ["ARAM", 5], 증바람: ["ARAM", 5], 기타게임: ["OTHER_GAME", 8],
    롤체일반: ["TFT_NORMAL", 8], 롤체랭크: ["TFT_RANK", 3], 더블업: ["DOUBLE_UP", 2],
  } as const;
  const definition = types[named[1] as keyof typeof types];
  return recognized("PARTY_CREATE", text, {
    partyType: definition[0],
    maximumMembers: definition[1],
    explicitRecruitNumber: named[2] ? Number(named[2]) : null,
  });
}

function classifyInhouse(text: string): KakaoV4RecognizedCommand | null {
  const detail = /^내전상세(?:\s*#?(\d+))?$/u.exec(text);
  if (detail) return recognized("INHOUSE_DETAIL", text, { recruitNumber: detail[1] ? Number(detail[1]) : null });
  const status = /^(?:내전현황|시즌내전현황|AI공지)(?:\s*#?(\d+))?$/u.exec(text);
  if (status) return recognized("INHOUSE_STATUS", text, { recruitNumber: status[1] ? Number(status[1]) : null });
  const join = /^(?:내전참가|내전신청|참가신청)(?:\s*#?(\d+))?$/u.exec(text);
  if (join) return recognized("INHOUSE_JOIN_GUIDE", text, { recruitNumber: join[1] ? Number(join[1]) : null });
  const create = /^(?:내전구인구직|내전구인|내전모집)(?:\s+(.*))?$/u.exec(text);
  if (!create) return null;
  const argumentsText = create[1]?.trim() ?? "";
  const modeToken = argumentsText.split(/\s+/u)[0]?.toLowerCase() ?? "";
  const modes: Readonly<Record<string, string>> = Object.freeze({
    협곡: "RIFT", 소환사의협곡: "RIFT", rift: "RIFT", 칼바람: "ARAM", 칼바람아수라장: "ARAM", aram: "ARAM",
    증바: "AUGMENT_ARAM", 증바람: "AUGMENT_ARAM", 증강칼바람: "AUGMENT_ARAM", augmentaram: "AUGMENT_ARAM",
  });
  return recognized("INHOUSE_CREATE", text, { mode: modes[modeToken] ?? null, argumentsText: argumentsText || null });
}

function classifyScrim(text: string): KakaoV4RecognizedCommand | null {
  const prefix = "(?:멸망전\\s*)?스크림\\s*";
  const lifecycle = [
    ["참가", "SCRIM_LEGACY_JOIN"],
    ["확정", "SCRIM_LEGACY_CONFIRM"],
    ["취소", "SCRIM_LEGACY_CANCEL"],
    ["(?:마감|종료)", "SCRIM_LEGACY_FINISH"],
  ] as const;
  for (const [suffix, command] of lifecycle) {
    const match = new RegExp(`^${prefix}${suffix}(?:\\s*#?(\\d+))?(?:\\s+(.*))?$`, "u").exec(text);
    if (match) return recognized(command, text, { scrimNumber: match[1] ? Number(match[1]) : null, argumentsText: match[2] ?? null });
  }
  const detail = new RegExp(`^${prefix}상세\\s*#?(\\d+)$`, "u").exec(text);
  if (detail) return recognized("SCRIM_DETAIL", text, { scrimNumber: Number(detail[1]) });
  const status = new RegExp(`^${prefix}(?:현황|목록)(?:\\s*#?(\\d+))?$`, "u").exec(text);
  if (status) return recognized("SCRIM_STATUS", text, { tournamentNumber: status[1] ? Number(status[1]) : null });
  if (/^(?:스크림\s*(?:구인|모집)|멸망전\s*스크림(?:\s*(?:구인|모집))?)$/u.test(text)) return recognized("SCRIM_CREATE", text);
  return null;
}

function classifyPlayer(text: string): KakaoV4RecognizedCommand | null {
  const record = /^전적\s+(.+)$/u.exec(text);
  if (record) return recognized("PLAYER_RECORD", text, { riotId: record[1]!.trim() });
  const recent = /^최근\s+(.+)$/u.exec(text);
  if (recent) return recognized("PLAYER_RECENT", text, { riotId: recent[1]!.trim() });
  if (text === "랭킹") return recognized("PLAYER_RANKING", text);
  return null;
}

function classifyOperations(text: string): KakaoV4RecognizedCommand | null {
  if (text === "사진상태") return recognized("OPERATIONS_PHOTO_STATUS", text);
  if (text === "V2사진취소") return recognized("OPERATIONS_PHOTO_CANCEL", text, {}, "COMMAND", "INTERNAL");
  if (text === "내전미리보기취소") return recognized("OPERATIONS_INHOUSE_PREVIEW_CANCEL", text);
  const confirm = /^내전확인\s+(.+)$/u.exec(text);
  if (confirm) return recognized("OPERATIONS_INHOUSE_CONFIRM", text, { confirmationCode: confirm[1]!.trim() });
  const notice = /^(?:자동공지|공지생성)(?:\s+(12|15|18|20))?$/u.exec(text);
  if (notice) return recognized("OPERATIONS_SCHEDULE_NOTICE", text, { hour: notice[1] ? Number(notice[1]) : null });
  if (text.startsWith("[") && text.includes("양식") && /\sv\d+/iu.test(text)) {
    if (/징계|경고/u.test(text)) return recognized("OPERATIONS_DISCIPLINE_CREATE", text);
    if (/내전|경기|결과/u.test(text)) return recognized("OPERATIONS_INHOUSE_RESULT", text);
    return recognized("OPERATIONS_REGISTRATION_HUB", text);
  }
  if (["등록", "등록도움말", "사진취소"].includes(text)) return recognized("OPERATIONS_REGISTRATION_HUB", text);
  if (["내전등록", "결과등록", "내전결과"].includes(text) || /^내전등록\s+\S/u.test(text)) return recognized("OPERATIONS_INHOUSE_RESULT", text);
  if (["내전등록현황", "결과현황"].includes(text) || /^내전현황\s+MR[A-F0-9]{10,16}$/iu.test(text)) return recognized("OPERATIONS_INHOUSE_RESULT_STATUS", text);
  if (["경고등록", "경고"].includes(text) || /^경고등록\s+\S/u.test(text)) return recognized("OPERATIONS_DISCIPLINE_CREATE", text);
  if (["인증", "경고인증"].includes(text) || /^경고인증완료\s+\S/u.test(text)) return recognized("OPERATIONS_DISCIPLINE_EVIDENCE", text);
  if (text === "경고현황" || /^경고현황\s+\S/u.test(text)) return recognized("OPERATIONS_DISCIPLINE_STATUS", text);
  return classifyOperationForm(text);
}

function classifyCanonicalText(text: string): KakaoV4RecognizedCommand | null {
  return classifyLocal(text) ?? classifyParty(text) ?? classifyInhouse(text) ?? classifyScrim(text) ?? classifyPlayer(text) ?? classifyOperations(text);
}

export function classifyKakaoV4Command(input: Readonly<{
  profileId: KakaoV4ProfileId;
  text: string;
}>): KakaoV4CommandClassification {
  const canonicalText = canonicalKakaoV4CommandText(input.text);
  if (canonicalText === null) {
    return Object.freeze({ kind: "UNKNOWN", canonicalText: null, reason: slashBoundaryReason(input.text) });
  }

  const snapshot = classifySnapshot(canonicalText);
  if (snapshot) return withProfile(snapshot, input.profileId);

  const result = classifyCanonicalText(canonicalText);
  if (result) return withProfile(result, input.profileId);
  return Object.freeze({ kind: "UNKNOWN", canonicalText, reason: "NO_MATCH" });
}
