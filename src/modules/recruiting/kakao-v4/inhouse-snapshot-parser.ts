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
  const row = /^\s*(\d{1,2})(?:(?:\s*\\?\s*[.)])|\s+)(.*?)\s*$/u.exec(line);
  if (!row) return Object.freeze({ matched: false });
  const slotNo = Number(row[1]);
  const value = row[2]!.trim();
  if (!value) return Object.freeze({ matched: true, valid: true, slotNo, participant: null, diagnostics: Object.freeze([]) });

  const fields = value.split("/").map((field) => field.trim());
  const name = fields[0] ?? "";
  const reserve = /(?:예비|대기)/u.test(value);
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
  if (fields.length < 4) return invalid(slotNo, "mainPosition", reviewParticipant(slotNo, name, "ALL", [], reserve));

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
