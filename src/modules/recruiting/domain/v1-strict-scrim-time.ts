const V1_STRICT_SCRIM_TIME_PREFIX = "[[KLOL_V1_SCRIM_TIME_V1]]";
const KST_OFFSET_MILLISECONDS = 9 * 60 * 60 * 1_000;

function normalizedTimeText(value: string | null) {
  const text = value?.normalize("NFKC").trim().replace(/\s+/gu, " ") ?? "";
  return text ? text.slice(0, 160) : null;
}

function hour24(period: string | undefined, value: number) {
  if (period === "오후" && value < 12) return value + 12;
  if (period === "오전" && value === 12) return 0;
  return value;
}

function kstInstant(year: number, month: number, day: number, hour: number, minute: number) {
  if (year < 2000 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31 || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  const value = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0) - KST_OFFSET_MILLISECONDS);
  const kst = new Date(value.getTime() + KST_OFFSET_MILLISECONDS);
  if (
    kst.getUTCFullYear() !== year || kst.getUTCMonth() + 1 !== month || kst.getUTCDate() !== day ||
    kst.getUTCHours() !== hour || kst.getUTCMinutes() !== minute
  ) return null;
  return value.toISOString();
}

/** V40's accepted M/D, 오전/오후, H시 and free-text `일시` behavior. */
export function parseV1StrictScrimTime(value: string | null, fallbackDate: string) {
  const text = normalizedTimeText(value);
  if (!text) return Object.freeze({ scheduledAt: null, startTimeText: null });
  const [year, fallbackMonth, fallbackDay] = fallbackDate.split("-").map(Number);
  if (!year || !fallbackMonth || !fallbackDay) return Object.freeze({ scheduledAt: null, startTimeText: text });

  const full = /(\d{1,2})\s*[\/.\-]\s*(\d{1,2})\s+(오전|오후)?\s*(\d{1,2})(?:(?:\s*:\s*(\d{1,2}))|(?:\s*시(?:\s*(\d{1,2})\s*분?)?))?/u.exec(text);
  if (full) {
    const month = Number(full[1]);
    const day = Number(full[2]);
    const hour = hour24(full[3], Number(full[4]));
    const minute = Number(full[5] ?? full[6] ?? 0);
    const scheduledAt = kstInstant(year, month, day, hour, minute);
    if (scheduledAt) {
      return Object.freeze({
        scheduledAt,
        startTimeText: `${month}/${day} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
      });
    }
  }

  const clock = /(?:^|\s)(오전|오후)?\s*(\d{1,2})(?:(?:\s*:\s*(\d{1,2}))|(?:\s*시(?:\s*(\d{1,2})\s*분?)?))?(?:\s|$)/u.exec(text);
  if (clock) {
    const hour = hour24(clock[1], Number(clock[2]));
    const minute = Number(clock[3] ?? clock[4] ?? 0);
    const scheduledAt = kstInstant(year, fallbackMonth, fallbackDay, hour, minute);
    if (scheduledAt) {
      return Object.freeze({
        scheduledAt,
        startTimeText: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
      });
    }
  }

  return Object.freeze({ scheduledAt: null, startTimeText: text });
}

/** The V2 table has no legacy start-time column, so the unused V1 memo slot carries only a free-text fallback. */
export function encodeV1StrictScrimTimeText(value: string | null) {
  const text = normalizedTimeText(value);
  return text ? `${V1_STRICT_SCRIM_TIME_PREFIX}${text}` : null;
}

export function decodeV1StrictScrimTimeText(value: string | null) {
  if (!value?.startsWith(V1_STRICT_SCRIM_TIME_PREFIX)) return null;
  return normalizedTimeText(value.slice(V1_STRICT_SCRIM_TIME_PREFIX.length));
}

export function publicScrimMemo(value: string | null) {
  return decodeV1StrictScrimTimeText(value) === null ? value : null;
}
