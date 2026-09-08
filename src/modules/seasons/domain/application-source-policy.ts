import type { SeasonApplicationSource, SeasonApplicationStatus } from "./season";

export const SEASON_APPLICATION_MERGE_POLICY = "SITE_AND_REVIEWED_DECISIONS_WIN" as const;

export type SeasonApplicationMergePlan =
  | Readonly<{ action: "CREATE_KAKAO"; outcome: "KAKAO_CREATED" }>
  | Readonly<{ action: "REFRESH_KAKAO"; outcome: "KAKAO_REFRESHED" }>
  | Readonly<{ action: "PRESERVE"; outcome: "SITE_PRESERVED" | "REVIEWED_PRESERVED" }>;

export type SiteApplicationMergePlan =
  | Readonly<{ action: "CREATE_SITE"; outcome: "SITE_CREATED" }>
  | Readonly<{ action: "PROMOTE_TO_SITE"; outcome: "KAKAO_PROMOTED_TO_SITE" | "SITE_UPDATED" }>
  | Readonly<{ action: "PRESERVE_REVIEW"; outcome: "REVIEWED_PRESERVED" }>;

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

/**
 * A deliberate signed-in site submission becomes the canonical editable row.
 * It reuses a matching Kakao row, clears bot-only provenance and thereafter
 * wins later snapshots. A completed administrator decision stays immutable.
 */
export function planSiteApplicationMerge(
  existing: Readonly<{ source: SeasonApplicationSource; status: SeasonApplicationStatus }> | null,
): SiteApplicationMergePlan {
  if (!existing) return { action: "CREATE_SITE", outcome: "SITE_CREATED" };
  if (["CONFIRMED", "RESERVE", "REJECTED"].includes(existing.status)) {
    return { action: "PRESERVE_REVIEW", outcome: "REVIEWED_PRESERVED" };
  }
  return existing.source === "KAKAO"
    ? { action: "PROMOTE_TO_SITE", outcome: "KAKAO_PROMOTED_TO_SITE" }
    : { action: "PROMOTE_TO_SITE", outcome: "SITE_UPDATED" };
}
