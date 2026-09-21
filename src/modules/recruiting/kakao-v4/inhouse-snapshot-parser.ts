import type { SeasonApplicationPosition } from "@/modules/seasons/domain/season";

export type KakaoV4InhouseParticipantDiagnostic = Readonly<{
  code: "RECOVERED_MISSING_POSITION_DELIMITER";
  field: "mainPosition/subPositions";
}>;

export type KakaoV4InhouseParticipant = Readonly<{
  slotNo: number;
  name: string;
  riotId: null;
  mainPosition: SeasonApplicationPosition;
  subPositions: readonly SeasonApplicationPosition[];
  reserve: boolean;
  /** Kept for snapshots saved before explicit RIFT positions became mandatory. */
  nameOnly?: true;
  /** Internal V4 hint: preserve the row for manual review instead of auto-matching it. */
  reviewRequired?: true;
}>;

export type KakaoV4InhouseParticipantRowResult =
  | Readonly<{ matched: false }>
  | Readonly<{
      matched: true;
      valid: false;
      slotNo: number;
      field: "name" | "mainPosition" | "subPositions";
      participant: KakaoV4InhouseParticipant | null;
      diagnostics: readonly KakaoV4InhouseParticipantDiagnostic[];
    }>
  | Readonly<{
      matched: true;
      valid: true;
      slotNo: number;
      participant: KakaoV4InhouseParticipant | null;
      diagnostics: readonly KakaoV4InhouseParticipantDiagnostic[];
    }>;

function seasonPosition(value: string): SeasonApplicationPosition | null {
  const token = value.trim().toUpperCase();
  if (token === "탑" || token === "T") return "TOP";
  if (token === "정글" || token === "JG" || token === "JUG") return "JGL";
  if (token === "미드" || token === "MD" || token === "M") return "MID";
  if (token === "원딜" || token === "AD" || token === "원딜러") return "ADC";
  if (token === "서폿" || token === "서포터" || token === "S") return "SUP";
  if (token === "올" || token === "전체" || token === "FILL") return "ALL";
  return ["TOP", "JGL", "MID", "ADC", "SUP", "ALL"].includes(token) ? token as SeasonApplicationPosition : null;
}

const RIFT_POSITIONS = Object.freeze(["TOP", "JGL", "MID", "ADC", "SUP"] as const);
const LEGACY_TIER_TOKEN = /^(?:[IBSGPEDMCU]|GM|IRON|BRONZE|SILVER|GOLD|PLATINUM|EMERALD|DIAMOND|MASTER|GRANDMASTER|CHALLENGER|UNRANKED|아이언|브론즈|실버|골드|플래티넘|에메랄드|다이아(?:몬드)?|마스터|그랜드마스터|챌린저|언랭|미정|-)(?:[1-4])?$/iu;

function looksLikeLegacyFullParticipant(value: string) {
  const fields = value.split("/").map((field) => field.trim());
  return fields.length >= 4 && fields[1] !== undefined && fields[2] !== undefined &&
    (fields[1] === "" || LEGACY_TIER_TOKEN.test(fields[1])) &&
    (fields[2] === "" || LEGACY_TIER_TOKEN.test(fields[2]));
}

function positionTokens(value: string) {
  // A comma or slash always separates actual choices. Do not turn a trailing
  // comma into a valid main-only entry by filtering its empty token away.
  const fields = value.split(/[/,，、]/u).map((field) => field.trim());
  if (fields.some((field) => !field)) return null;
  return fields.flatMap((field) => field.split(/\s+/u));
}

export function parseKakaoV4InhousePositionShortcut(value: string): KakaoV4InhouseParticipant | null {
  const normalized = value.normalize("NFKC").trim();
  if (!normalized || /[\r\n\u2028\u2029]/u.test(normalized)) return null;
  const fields = normalized.split("/").map((field) => field.trim());
  if (fields.length < 2 || fields.some((field) => !field)) return null;
  const name = fields[0]!;
  const tokens = positionTokens(fields.slice(1).join("/"));
  if (!tokens?.length) return null;
  const positions = tokens.map(seasonPosition);
  if (positions.some((position) => position === null)) return null;
  const mainPosition = positions[0]!;
  const requestedSubPositions = positions.slice(1) as SeasonApplicationPosition[];
  if (mainPosition === "ALL" && requestedSubPositions.length > 0) return null;
  const subPositions = requestedSubPositions.includes("ALL")
    ? RIFT_POSITIONS.filter((position) => position !== mainPosition)
    : [...new Set(requestedSubPositions.filter((position) => position !== mainPosition))];
  return Object.freeze({
    slotNo: 1,
    name,
    riotId: null,
    mainPosition,
    subPositions: Object.freeze(subPositions),
    reserve: false,
  });
}

export function isKakaoV4InhouseStructuredAddName(value: string) {
  return /^[^/]+\/[^/]*\/[^/]*\/[^/]+(?:\/.*)?$/u.test(value) || parseKakaoV4InhousePositionShortcut(value) !== null;
}

export function parseKakaoV4InhouseStructuredAdd(value: string): KakaoV4InhouseParticipant | null {
  const shortcut = parseKakaoV4InhousePositionShortcut(value);
  if (shortcut && !looksLikeLegacyFullParticipant(value.normalize("NFKC"))) return shortcut;
  const legacy = parseKakaoV4InhouseParticipantRow(`1.${value}`, "RIFT");
  if (legacy.matched && legacy.valid && legacy.participant) return legacy.participant;
  return shortcut;
}

function isEmptySubPosition(value: string) {
  return /^(?:없음|-|미정)$/u.test(value.trim());
}

function invalid(
  slotNo: number,
  field: "name" | "mainPosition" | "subPositions",
  participant: KakaoV4InhouseParticipant | null,
  diagnostics: readonly KakaoV4InhouseParticipantDiagnostic[] = Object.freeze([]),
): KakaoV4InhouseParticipantRowResult {
  return Object.freeze({ matched: true, valid: false, slotNo, field, participant, diagnostics });
}

function reviewParticipant(
  slotNo: number,
  name: string,
  mainPosition: SeasonApplicationPosition,
  subPositions: readonly SeasonApplicationPosition[],
  reserve: boolean,
): KakaoV4InhouseParticipant | null {
  if (!name) return null;
  return Object.freeze({
    slotNo,
    name,
    riotId: null,
    mainPosition,
    subPositions: Object.freeze([...new Set(subPositions)].filter((position) => position !== mainPosition && position !== "ALL")),
    reserve,
    reviewRequired: true,
  });
}

export function parseKakaoV4InhouseParticipantRow(
  rawLine: string,
  mode: "RIFT" | "ARAM" | "AUGMENT_ARAM",
): KakaoV4InhouseParticipantRowResult {
  const line = rawLine.normalize("NFKC");
  const row = /^\s*((?:예비|대기)\s*)?(\d{1,2})(?:(?:\s*\\?\s*[.)])|\s+)(.*?)\s*$/u.exec(line);
  if (!row) return Object.freeze({ matched: false });
  const slotNo = Number(row[2]);
  const value = row[3]!.trim();
  const reserve = Boolean(row[1]);
  if (!value) return Object.freeze({ matched: true, valid: true, slotNo, participant: null, diagnostics: Object.freeze([]) });

  const fields = value.split("/").map((field) => field.trim());
  const name = fields[0] ?? "";
  if (!name) return invalid(slotNo, "name", null);
  if (mode !== "RIFT") {
    return Object.freeze({
      matched: true,
      valid: true,
      slotNo,
      participant: Object.freeze({ slotNo, name, riotId: null, mainPosition: "ALL", subPositions: Object.freeze([]), reserve }),
      diagnostics: Object.freeze([]),
    });
  }
  if (fields.length === 1) {
    return invalid(slotNo, "mainPosition", null);
  }
  if (!looksLikeLegacyFullParticipant(value)) {
    const shortcut = parseKakaoV4InhousePositionShortcut(value);
    if (shortcut) return Object.freeze({
      matched: true,
      valid: true,
      slotNo,
      participant: Object.freeze({ ...shortcut, slotNo, reserve }),
      diagnostics: Object.freeze([]),
    });
    return invalid(slotNo, "mainPosition", null);
  }

  const positionFields = fields.slice(3);
  // Older five-field forms allow an empty final sub-position, but still need
  // an explicit valid main position. Empty comma-separated choices are errors.
  const populatedPositionFields = [...positionFields];
  if (populatedPositionFields.length > 1 && populatedPositionFields.at(-1) === "") populatedPositionFields.pop();
  const tokens = positionTokens(populatedPositionFields.join("/"));
  if (!tokens?.length) return invalid(slotNo, "mainPosition", null);
  const diagnostics: KakaoV4InhouseParticipantDiagnostic[] = [];
  if (positionFields.length === 1 && tokens.length >= 2) {
    diagnostics.push(Object.freeze({ code: "RECOVERED_MISSING_POSITION_DELIMITER", field: "mainPosition/subPositions" }));
  }

  const mainPosition = seasonPosition(tokens[0] ?? "");
  if (!mainPosition) {
    return invalid(slotNo, "mainPosition", reviewParticipant(slotNo, name, "ALL", [], reserve), Object.freeze(diagnostics));
  }
  const rawSubPositions = tokens.slice(1)
    .filter((field) => field.length > 0 && !isEmptySubPosition(field));
  const parsedSubPositions = rawSubPositions.map(seasonPosition);
  if (parsedSubPositions.some((position) => position === null)) {
    return invalid(
      slotNo,
      positionFields.length === 1 ? "mainPosition" : "subPositions",
      reviewParticipant(slotNo, name, mainPosition, parsedSubPositions.filter((position): position is SeasonApplicationPosition => position !== null), reserve),
      Object.freeze(diagnostics),
    );
  }
  const subPositions = parsedSubPositions.includes("ALL")
    ? RIFT_POSITIONS.filter((position) => position !== mainPosition)
    : parsedSubPositions.filter((position): position is SeasonApplicationPosition => Boolean(position && position !== mainPosition));
  const uniqueSubPositions = Object.freeze([...new Set(subPositions)]);
  if (mainPosition === "ALL" && parsedSubPositions.length > 0) {
    return invalid(slotNo, "subPositions", reviewParticipant(slotNo, name, "ALL", [], reserve), Object.freeze(diagnostics));
  }
  return Object.freeze({
    matched: true,
    valid: true,
    slotNo,
    participant: Object.freeze({
      slotNo,
      name,
      riotId: null,
      mainPosition,
      subPositions: uniqueSubPositions,
      reserve,
    }),
    diagnostics: Object.freeze(diagnostics),
  });
}

/** User-facing diagnostics for a rejected full copy, with no partial mutation. */
export function getKakaoV4InhouseInputErrors(
  text: string,
  mode?: "RIFT" | "ARAM" | "AUGMENT_ARAM",
): readonly string[] {
  const normalized = text.normalize("NFKC").replace(/\r\n?/gu, "\n");
  const modernHeader = /^\s*\[내전\s*#\s*\d{1,3}\]\s*(?:(협곡|칼바람|증바람|증강칼바람)\s*·\s*)?\d{1,2}\s*\/\s*(\d{1,2})명\s*$/mu.exec(normalized);
  const modeLabel = modernHeader?.[1] ?? /^\s*》\s*(?:모드\s*[:：]\s*)?(협곡|칼바람|증바람|증강칼바람)\s*$/mu.exec(normalized)?.[1];
  const resolvedMode = mode ?? (modeLabel === "협곡" ? "RIFT" : modeLabel === "칼바람" ? "ARAM" : modeLabel ? "AUGMENT_ARAM" : null);
  const capacity = Number(modernHeader?.[2] ?? /^\s*👥\s*\d{1,3}\s*\/\s*(\d{1,3})\s*명\s*$/mu.exec(normalized)?.[1] ?? 0);
  if (!resolvedMode || capacity < 2 || capacity > 20) return Object.freeze([]);

  const errors: string[] = [];
  const mainSlots = new Set<number>();
  const bodySlots = new Set<number>();
  const rows = new Map<number, Readonly<{ name: string; label: string }>>();
  const pendingRows: string[] = [];
  for (const line of normalized.split("\n")) {
    if (/^\s*확인\s+/u.test(line)) {
      pendingRows.push(line.replace(/^\s*확인\s+/u, ""));
      continue;
    }
    const row = parseKakaoV4InhouseParticipantRow(line, resolvedMode);
    if (!row.matched) continue;
    const reserve = /^\s*(?:예비|대기)\s*\d/u.test(line);
    const slotNo = reserve ? capacity + row.slotNo : row.slotNo;
    const label = `${reserve ? "예비 " : ""}${row.slotNo}번`;
    if (!row.valid && !modernHeader && mainSlots.size >= capacity && !reserve && !line.includes("/")) continue;
    if (!reserve) mainSlots.add(row.slotNo);
    if (row.slotNo < 1 || row.slotNo > capacity) {
      errors.push(`${label}은 양식 번호 범위를 벗어났어요. 최신 내전상세 양식을 복사해 주세요.`);
      continue;
    }
    if (modernHeader && bodySlots.has(slotNo)) errors.push(`${label}이 두 번 들어 있어요. 각 번호는 한 줄만 남겨 주세요.`);
    bodySlots.add(slotNo);
    if (!row.valid) {
      if (modernHeader && /^\s*\d{1,2}\.\s*\(회원 확인 중\)\s*$/u.test(line)) continue;
      errors.push(row.field === "name"
        ? `${label}에 이름을 입력해 주세요.`
        : `${label}은 협곡 라인이 필요해요. 예: 이름/top,mid 또는 이름/all. 빈 구분자와 all,mid는 사용할 수 없어요.`);
      continue;
    }
    if (row.participant) rows.set(slotNo, { name: row.participant.name, label });
    else rows.delete(slotNo);
  }
  // Old forms may have pending names below the roster. The edited body is
  // authoritative, while an unchanged placeholder still needs explicit lanes.
  for (const line of pendingRows) {
    const row = parseKakaoV4InhouseParticipantRow(line, resolvedMode);
    if (!row.matched) continue;
    const reserve = /^\s*(?:예비|대기)\s*\d/u.test(line);
    const slotNo = reserve ? capacity + row.slotNo : row.slotNo;
    if (rows.has(slotNo)) continue;
    if (!row.valid) errors.push(`${reserve ? "예비 " : ""}${row.slotNo}번은 협곡 라인이 필요해요. 본문에 이름/top,mid 또는 이름/all로 적어 주세요.`);
  }
  if (modernHeader) {
    const missing = Array.from({ length: capacity }, (_, index) => index + 1).filter((slotNo) => !mainSlots.has(slotNo));
    if (missing.length) errors.push(`${missing.join(", ")}번 행이 빠졌어요. 이름을 지울 때도 번호는 남기고 전체 양식을 보내 주세요.`);
  }
  const names = new Map<string, string>();
  for (const { name, label } of rows.values()) {
    const key = name.trim().replace(/\s+/gu, " ").toLocaleLowerCase("ko-KR");
    const previous = names.get(key);
    if (previous) errors.push(`${previous}과 ${label}의 이름이 같아요. 동명이인은 이름(닉네임)처럼 구분해서 적어 주세요.`);
    else names.set(key, label);
  }
  return Object.freeze([...new Set(errors)].slice(0, 5));
}
