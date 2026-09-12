export const PARTY_MEMBER_STATS_MINIMUM_QUERY_LENGTH = 2;
export const PARTY_MEMBER_STATS_MAXIMUM_QUERY_LENGTH = 40;
export const PARTY_MEMBER_STATS_LOOKBACK_DAYS = 365;
export const PARTY_MEMBER_STATS_SCAN_LIMIT = 1_000;
export const PARTY_MEMBER_STATS_RESULT_LIMIT = 10;
export const PARTY_MEMBER_STATS_COMPANION_LIMIT = 8;

const CONTROL_OR_BIDI = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u;

export type PartyMemberStatsQuery =
  | Readonly<{ state: "empty"; query: "" }>
  | Readonly<{ state: "invalid"; query: string }>
  | Readonly<{ state: "ready"; query: string }>;

export function parsePartyMemberStatsQuery(value: unknown): PartyMemberStatsQuery {
  if (value === undefined || value === null || value === "") return Object.freeze({ state: "empty", query: "" });
  if (typeof value !== "string") return Object.freeze({ state: "invalid", query: "" });
  const query = value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("ko-KR");
  if (!query) return Object.freeze({ state: "empty", query: "" });
  if (
    query.length < PARTY_MEMBER_STATS_MINIMUM_QUERY_LENGTH ||
    query.length > PARTY_MEMBER_STATS_MAXIMUM_QUERY_LENGTH ||
    CONTROL_OR_BIDI.test(query)
  ) return Object.freeze({ state: "invalid", query });
  return Object.freeze({ state: "ready", query });
}
