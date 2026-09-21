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
  /** A name-only copy keeps any positions already saved for this member. */
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

export function parseKakaoV4InhousePositionShortcut(value: string): KakaoV4InhouseParticipant | null {
  const normalized = value.normalize("NFKC").trim();
  if (!normalized || /[\r\n\u2028\u2029]/u.test(normalized)) return null;
  const fields = normalized.split("/").map((field) => field.trim());
  if (fields.length < 2 || fields.some((field) => !field)) return null;
  const name = fields[0]!;
  const positionTokens = fields.slice(1).flatMap((field) => field.split(/[\s,，、]+/u)).filter(Boolean);
  if (positionTokens.length < 1) return null;
  const positions = positionTokens.map(seasonPosition);
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
    return Object.freeze({
      matched: true, valid: true, slotNo,
      participant: Object.freeze({ slotNo, name, riotId: null, mainPosition: "ALL", subPositions: Object.freeze([]), reserve, nameOnly: true }),
      diagnostics: Object.freeze([]),
    });
  }
  if (fields.length < 4) {
    const shortcut = parseKakaoV4InhousePositionShortcut(value);
    if (shortcut) return Object.freeze({
      matched: true,
      valid: true,
      slotNo,
      participant: Object.freeze({ ...shortcut, slotNo, reserve }),
      diagnostics: Object.freeze([]),
    });
    return invalid(slotNo, "mainPosition", reviewParticipant(slotNo, name, "ALL", [], reserve));
  }

  const positionFields = fields.slice(3);
  const positionTokens = positionFields.flatMap((field) => field.split(/[\s,，]+/u)).filter(Boolean);
  const diagnostics: KakaoV4InhouseParticipantDiagnostic[] = [];
  if (positionFields.length === 1 && positionTokens.length >= 2) {
    diagnostics.push(Object.freeze({ code: "RECOVERED_MISSING_POSITION_DELIMITER", field: "mainPosition/subPositions" }));
  }

  const mainPosition = seasonPosition(positionTokens[0] ?? "");
  if (!mainPosition) {
    return invalid(slotNo, "mainPosition", reviewParticipant(slotNo, name, "ALL", [], reserve), Object.freeze(diagnostics));
  }
  const rawSubPositions = positionTokens.slice(1)
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
  const subPositions = parsedSubPositions.filter((position): position is SeasonApplicationPosition => Boolean(
    position && position !== "ALL" && position !== mainPosition,
  ));
  const uniqueSubPositions = Object.freeze([...new Set(subPositions)]);
  if (mainPosition === "ALL" && uniqueSubPositions.length > 0) {
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
