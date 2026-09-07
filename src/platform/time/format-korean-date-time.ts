const koreanDateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "Asia/Seoul",
});

export function formatKoreanDateTime(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "기록 없음";

  const parts = Object.fromEntries(
    koreanDateTimeFormatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return `${parts.year}. ${parts.month}. ${parts.day}. ${parts.hour}:${parts.minute}`;
}

export function formatOptionalKoreanDateTime(value: string | null): string {
  return value ? formatKoreanDateTime(value) : "기록 없음";
}
