import type { SeasonApplicationSource, SeasonApplicationStatus } from "./season";

export const SEASON_APPLICATION_MERGE_POLICY = "SITE_AND_REVIEWED_DECISIONS_WIN" as const;

export type SeasonApplicationMergePlan =
  | Readonly<{ action: "CREATE_KAKAO"; outcome: "KAKAO_CREATED" }>
  | Readonly<{ action: "REFRESH_KAKAO"; outcome: "KAKAO_REFRESHED" }>
  | Readonly<{ action: "PRESERVE"; outcome: "SITE_PRESERVED" | "REVIEWED_PRESERVED" }>;

/**
 * SITE and Kakao share one identity row. A bot snapshot must never overwrite a
 * deliberate site choice or a completed administrator decision. Only an
 * unreviewed/cancelled Kakao row may be refreshed from a reviewed pending item.
 */
export function planSeasonApplicationMerge(
  existing: Readonly<{ source: SeasonApplicationSource; status: SeasonApplicationStatus }> | null,
): SeasonApplicationMergePlan {
  if (!existing) return { action: "CREATE_KAKAO", outcome: "KAKAO_CREATED" };
  if (existing.source === "SITE") return { action: "PRESERVE", outcome: "SITE_PRESERVED" };
  if (["CONFIRMED", "RESERVE", "REJECTED"].includes(existing.status)) {
    return { action: "PRESERVE", outcome: "REVIEWED_PRESERVED" };
  }
  return { action: "REFRESH_KAKAO", outcome: "KAKAO_REFRESHED" };
}
