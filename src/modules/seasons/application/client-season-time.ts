const localDateTimePattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

function assertCalendarValue(value: string) {
  const match = localDateTimePattern.exec(value);
  if (!match) throw new Error("날짜와 시간을 확인해 주세요.");
  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const [year, month, day, hour, minute] = [yearText, monthText, dayText, hourText, minuteText].map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day, hour, minute));
  if (
    probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day || probe.getUTCHours() !== hour || probe.getUTCMinutes() !== minute
  ) {
    throw new Error("날짜와 시간을 확인해 주세요.");
  }
}

export function kstIsoFromDateTimeLocal(value: string): string | null {
  if (!value) return null;
  assertCalendarValue(value);
  return `${value}:00+09:00`;
}

export function kstDateTimeLocalFromIso(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${fields.year}-${fields.month}-${fields.day}T${fields.hour}:${fields.minute}`;
}
