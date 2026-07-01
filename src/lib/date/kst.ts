export function getKstDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function getKstDisplayDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-");
  return `${Number(year)}-${Number(month)}-${Number(day)}`;
}

export function getKstStartOfDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);

  if (!year || !month || !day) {
    throw new Error("KST 날짜 형식이 올바르지 않습니다.");
  }

  return new Date(Date.UTC(year, month - 1, day, -9, 0, 0, 0));
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function getTodayKstRange() {
  const start = getKstStartOfDate(getKstDateKey());
  const end = addDays(start, 1);
  end.setMilliseconds(end.getMilliseconds() - 1);

  return { start, end };
}

export function parseKstDateTime(value: string) {
  const text = value.trim();

  if (!text) return null;

  if (/Z$|[+-]\d{2}:?\d{2}$/.test(text)) {
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const normalized = text.length === 16 ? `${text}:00` : text;
  const parsed = new Date(`${normalized}+09:00`);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function toKstDateTimeLocalInputValue(date = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(date)
    .replace(" ", "T");
}

export function getMatchDateTimeLocalFromTitle(title: string, fallback = new Date()) {
  const match = title.trim().match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);

  if (!match) {
    return toKstDateTimeLocalInputValue(fallback);
  }

  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T00:00`;
}
