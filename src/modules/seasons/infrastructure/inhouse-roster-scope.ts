import { and, eq, or } from "drizzle-orm";
import { seasonApplications, seasonKakaoPendingApplications } from "@/platform/db/schema/seasons";

export type InhouseRosterScope = Readonly<{ sourceRoomIdHash: Buffer; mode: string }>;

/** Mirrors the scope/mode selection in the Kakao editable inhouse roster. */
export function inhouseApplicationScope(round: InhouseRosterScope | null | undefined) {
  return round ? or(eq(seasonApplications.source, "SITE"), and(
    eq(seasonApplications.sourceRoomIdHash, round.sourceRoomIdHash), eq(seasonApplications.sourceMode, round.mode),
  )) : undefined;
}

export function inhousePendingScope(round: InhouseRosterScope | null | undefined) {
  return round ? and(eq(seasonKakaoPendingApplications.sourceRoomIdHash, round.sourceRoomIdHash),
    eq(seasonKakaoPendingApplications.sourceMode, round.mode)) : undefined;
}
