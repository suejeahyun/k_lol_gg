export type KakaoRecruitMessageKind =
  | "SEASON_RECRUIT"
  | "PARTY_RECRUIT"
  | "SCRIM_RECRUIT"
  | "OPERATION_FORM"
  | "GENERAL_COMMAND"
  | "UNKNOWN"
  | "AMBIGUOUS";

export type KakaoRecruitClassification = {
  kind: KakaoRecruitMessageKind;
  reason: string;
  matchedKinds: KakaoRecruitMessageKind[];
};

function normalizeText(value: string) {
  return String(value || "")
    .replace(/\r/g, "\n")
    .replace(/　/g, " ")
    .replace(/\u00A0/g, " ")
    .replace(/／/g, "/")
    .replace(/，/g, ",")
    .replace(/：/g, ":")
    .replace(/–|—/g, "-")
    .replace(/０/g, "0")
    .replace(/１/g, "1")
    .replace(/２/g, "2")
    .replace(/３/g, "3")
    .replace(/４/g, "4")
    .replace(/５/g, "5")
    .replace(/６/g, "6")
    .replace(/７/g, "7")
    .replace(/８/g, "8")
    .replace(/９/g, "9")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function compact(value: string) {
  return normalizeText(value).replace(/\s+/g, "");
}

function isScrimFormMessage(message: string) {
  const text = normalizeText(message);
  const normalized = compact(text);

  if (/\[?K-?LOL\.GG멸망전스크림구인양식\]?/.test(normalized)) return true;
  if (/스크림번호\s*[:：]/.test(text) && /(우리팀|아군팀|요청팀)/.test(text) && /상대팀/.test(text)) return true;
  if (/멸망전\s*(번호|ID)\s*[:：]/.test(text) && /일시\s*[:：]/.test(text) && /(우리팀|아군팀|요청팀)/.test(text) && /상대팀/.test(text)) return true;

  return false;
}

export function isScrimRecruitMessage(message: string) {
  const text = normalizeText(message);
  const normalized = compact(text).replace(/^\//, "");

  if (isScrimFormMessage(text)) return true;
  if (/^스크림(?:구인|모집|현황|목록|상세|참가|신청|확정|완료|마감|취소)(?:\s|$|#?\d)/.test(text.replace(/^\//, ""))) return true;
  if (/^스크림(?:구인|모집|현황|목록|상세|참가|신청|확정|완료|마감|취소)/.test(normalized)) return true;
  if (/^멸망전스크림(?:구인|모집|현황|목록|상세|참가|신청|확정|완료|마감|취소)?/.test(normalized)) return true;
  if (/\bSCRIM\b/i.test(text) && /(멸망전|팀|상대|연습|구인|모집)/.test(text)) return true;

  return false;
}

export function isSeasonRecruitSnapshotMessage(message: string) {
  const text = normalizeText(message);

  if (isScrimRecruitMessage(text)) return false;

  return (
    /(?:참가\s*신청\s*양식|협곡\s*내전|협곡내전|내전하실분)/.test(text) &&
    /^\s*(?:1|예비\s*1)\s*[.)]/m.test(text)
  );
}

export function isSeasonRecruitCommandMessage(message: string) {
  const text = compact(message);
  if (isScrimRecruitMessage(message)) return false;

  return /^\/?.*(?:내전구인구직|내전구인|내전현황|시즌내전현황|AI공지|오늘내전초기화|내전초기화)(?:#?\d{1,3})?$/.test(text);
}

export function isPartyRecruitCommandMessage(message: string) {
  const text = normalizeText(message);
  const normalized = compact(text);

  if (isScrimRecruitMessage(text) || isSeasonRecruitSnapshotMessage(text)) return false;

  return (
    /^\/?\d{1,2}\s*인\s*(?:협곡\s*)?(?:파티|구인)(?:\s+\d{1,2})?\s*$/.test(text) ||
    /^\/?.*(?:칼바람구인|증바람구인|솔랭구인|자랭구인|일반구인|기타게임구인|롤체일반구인|롤체랭크구인|더블업구인|5인협곡파티)(?:\s+\d{1,2})?$/.test(text) ||
    /^\/?.*(?:현재구인구직현황|현재구인현황|구인구직현황|구인현황|현황|구인상세|상세)(?:#?\d{1,2})?$/.test(normalized) ||
    /^\/?.*(?:구인마감|구인쫑|구인종료)#?\d{1,2}$/.test(normalized) ||
    /^\/?#?\d{1,2}(?:쫑|ㅉ)$/.test(normalized)
  );
}

export function isPartyRecruitFormMessage(message: string) {
  const text = normalizeText(message);
  if (isScrimRecruitMessage(text) || isSeasonRecruitSnapshotMessage(text)) return false;
  if (!/(모집번호\s*[:：]?\s*#?\s*\d{1,2}|(^|\s)#\s*\d{1,2}(?=\s|·|$))/m.test(text)) return false;

  return (
    /(^|\n)\s*(TOP|JUG|JGL|JG|MID|ADC|AD|SUP|탑|정글|미드|원딜|서폿|서포터)\s*[.:：]?/i.test(text) ||
    /(^|\n)\s*\d{1,2}(?:[.)]|\s+)/.test(text)
  );
}

export function classifyKakaoRecruitMessage(message: string): KakaoRecruitClassification {
  const matchedKinds: KakaoRecruitMessageKind[] = [];

  if (isScrimRecruitMessage(message)) matchedKinds.push("SCRIM_RECRUIT");
  if (isSeasonRecruitSnapshotMessage(message) || isSeasonRecruitCommandMessage(message)) matchedKinds.push("SEASON_RECRUIT");
  if (isPartyRecruitCommandMessage(message) || isPartyRecruitFormMessage(message)) matchedKinds.push("PARTY_RECRUIT");

  const uniqueKinds = Array.from(new Set(matchedKinds));

  if (uniqueKinds.length === 0) {
    return { kind: "UNKNOWN", reason: "no_recruit_pattern", matchedKinds: [] };
  }

  if (uniqueKinds.length > 1) {
    return { kind: "AMBIGUOUS", reason: "multiple_recruit_patterns", matchedKinds: uniqueKinds };
  }

  return { kind: uniqueKinds[0], reason: "single_match", matchedKinds: uniqueKinds };
}

export function buildWrongRecruitApiReply(params: {
  expected: "내전구인" | "파티구인" | "스크림구인";
  actual: KakaoRecruitMessageKind;
}) {
  const actualLabel =
    params.actual === "SEASON_RECRUIT"
      ? "내전구인"
      : params.actual === "PARTY_RECRUIT"
        ? "파티구인"
        : params.actual === "SCRIM_RECRUIT"
          ? "스크림구인"
          : params.actual === "AMBIGUOUS"
            ? "여러 구인 양식"
            : "알 수 없는 양식";

  return [
    `[K-LOL.GG ${params.expected} 반영 차단]`,
    "",
    `${actualLabel}으로 보이는 메시지가 ${params.expected} API로 들어왔습니다.`,
    "중복 인식/덮어쓰기를 막기 위해 저장하지 않았습니다.",
    "",
    "각 구인은 전용 명령어 또는 전용 양식으로 다시 보내주세요.",
  ].join("\n");
}
