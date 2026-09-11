import type { SeasonApplicationPosition } from "@/modules/seasons/domain/season";

export type KakaoV4InhouseParticipantDiagnostic = Readonly<{
  code: "RECOVERED_MISSING_POSITION_DELIMITER";
  field: "mainPosition/subPositions";
}>;

export type KakaoV4InhouseParticipantRowResult =
  | Readonly<{ matched: false }>
  | Readonly<{
      matched: true;
      valid: false;
      slotNo: number;
      field: "name" | "mainPosition" | "subPositions";
      diagnostics: readonly KakaoV4InhouseParticipantDiagnostic[];
    }>
  | Readonly<{
      matched: true;
      valid: true;
      slotNo: number;
      participant: Readonly<{
        slotNo: number;
        name: string;
        riotId: null;
        mainPosition: SeasonApplicationPosition;
        subPositions: readonly SeasonApplicationPosition[];
        reserve: boolean;
      }> | null;
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
  diagnostics: readonly KakaoV4InhouseParticipantDiagnostic[] = Object.freeze([]),
): KakaoV4InhouseParticipantRowResult {
  return Object.freeze({ matched: true, valid: false, slotNo, field, diagnostics });
}

export function parseKakaoV4InhouseParticipantRow(
  rawLine: string,
  mode: "RIFT" | "ARAM" | "AUGMENT_ARAM",
): KakaoV4InhouseParticipantRowResult {
  const line = rawLine.normalize("NFKC");
  const row = /^\s*(\d{1,2})\s*(?:\\\s*)?[.)]\s*(.*?)\s*$/u.exec(line);
  if (!row) return Object.freeze({ matched: false });
  const slotNo = Number(row[1]);
  const value = row[2]!.trim();
  if (!value) return Object.freeze({ matched: true, valid: true, slotNo, participant: null, diagnostics: Object.freeze([]) });

  const fields = value.split("/").map((field) => field.trim());
  if (!fields[0]) return invalid(slotNo, "name");
  if (mode !== "RIFT") {
    return Object.freeze({
      matched: true,
      valid: true,
      slotNo,
      participant: Object.freeze({ slotNo, name: fields[0], riotId: null, mainPosition: "ALL", subPositions: Object.freeze([]), reserve: /(?:예비|대기)/u.test(value) }),
      diagnostics: Object.freeze([]),
    });
  }
  if (fields.length < 4) return invalid(slotNo, "mainPosition");

  let positionFields = fields.slice(3);
  const diagnostics: KakaoV4InhouseParticipantDiagnostic[] = [];
  if (fields.length === 4) {
    const mergedPositions = fields[3]!.split(/\s+/u).filter(Boolean);
    if (mergedPositions.length === 2 && mergedPositions.every((entry) => seasonPosition(entry) !== null)) {
      positionFields = mergedPositions;
      diagnostics.push(Object.freeze({ code: "RECOVERED_MISSING_POSITION_DELIMITER", field: "mainPosition/subPositions" }));
    }
  }

  const mainPosition = seasonPosition(positionFields[0] ?? "");
  if (!mainPosition) return invalid(slotNo, "mainPosition", Object.freeze(diagnostics));
  const rawSubPositions = positionFields.slice(1)
    .flatMap((field) => field.split(/[,，]/u))
    .map((field) => field.trim())
    .filter((field) => field.length > 0 && !isEmptySubPosition(field));
  const parsedSubPositions = rawSubPositions.map(seasonPosition);
  if (parsedSubPositions.some((position) => position === null)) return invalid(slotNo, "subPositions", Object.freeze(diagnostics));
  const subPositions = parsedSubPositions.filter((position): position is SeasonApplicationPosition => Boolean(
    position && position !== "ALL" && position !== mainPosition,
  ));
  const uniqueSubPositions = Object.freeze([...new Set(subPositions)]);
  if (mainPosition === "ALL" && uniqueSubPositions.length > 0) return invalid(slotNo, "subPositions", Object.freeze(diagnostics));
  return Object.freeze({
    matched: true,
    valid: true,
    slotNo,
    participant: Object.freeze({
      slotNo,
      name: fields[0],
      riotId: null,
      mainPosition,
      subPositions: uniqueSubPositions,
      reserve: /(?:예비|대기)/u.test(value),
    }),
    diagnostics: Object.freeze(diagnostics),
  });
}
