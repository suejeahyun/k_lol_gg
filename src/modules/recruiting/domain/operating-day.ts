const OPERATING_DAY_BOUNDARY_HOURS_KST = 6;
const KST_OFFSET_HOURS = 9;

/** Recruiting days roll over at 06:00 KST instead of calendar midnight. */
export function recruitingOperatingDateKey(now: Date) {
  const milliseconds = now.getTime();
  if (!Number.isFinite(milliseconds)) throw new Error("INVALID_RECRUITING_OPERATING_INSTANT");
  const dateOffsetHours = KST_OFFSET_HOURS - OPERATING_DAY_BOUNDARY_HOURS_KST;
  return new Date(milliseconds + dateOffsetHours * 60 * 60 * 1_000).toISOString().slice(0, 10);
}
