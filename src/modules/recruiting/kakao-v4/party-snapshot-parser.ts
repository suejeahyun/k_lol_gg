const NUMBERED_ROW = /^\s*([0-9０-９]{1,2})(?:\s*\\?[.)．。）]|\s+)\s*(.*?)\s*$/u;
const POSITION_ROW = /^\s*(TOP|JUG|JGL|JG|MID|ADC|AD|SUP|탑|정글|미드|원딜|서폿|서포터)(?:\s*\\?[.:：．。]|\s+)\s*(.*?)\s*$/iu;
const RESERVE_ROW = /^\s*(?:예비|후보|대기)\s*([0-9０-９]{1,2})?(?:\s*\\?[.):：．。）]|\s+)?\s*(.*?)\s*$/u;

function rowNumber(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  return Number(value.replace(/[０-９]/gu, (digit) => String(digit.codePointAt(0)! - 0xFF10)));
}

/**
 * Kakao copy/paste can remove list punctuation or expose a Markdown escape.
 * A dot, closing parenthesis, or whitespace separator is still required, so
 * ordinary text such as `2명` and clock text such as `20:00` are not rows.
 */
export function parsePartyNumberedRow(line: string) {
  const match = NUMBERED_ROW.exec(line);
  if (!match) return null;
  return Object.freeze({ slotNo: rowNumber(match[1], 0), value: match[2]!.trim() });
}

export function parsePartyPositionRow(line: string) {
  const match = POSITION_ROW.exec(line);
  if (!match) return null;
  return Object.freeze({ label: match[1]!, value: match[2]!.trim() });
}

export function parsePartyReserveRow(line: string) {
  const match = RESERVE_ROW.exec(line);
  if (!match) return null;
  return Object.freeze({ slotNo: rowNumber(match[1], 1), value: match[2]!.trim() });
}
