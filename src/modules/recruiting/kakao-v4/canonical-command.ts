import type { SeasonApplicationPosition } from "@/modules/seasons/domain/season";

import type { ScrimFormCommandPayload, SyncScrimCommandPayload } from "../application/commands";
import type { RecruitMember, RecruitPartyType } from "../domain/recruiting";

export type KakaoV4RecruitTarget = Readonly<{
  recruitDate: string;
  recruitNumber: number;
}>;

export type KakaoV4PartyCreatePayload = Readonly<{
  recruitDate: string;
  preferredRecruitNumber: number | null;
  partyType: RecruitPartyType;
  title: string;
  maximumMembers: number;
  members: readonly RecruitMember[];
  startTimeText?: string | null;
  gameInfo?: string | null;
  scheduledStartAt: string | null;
  protectedUntil: string | null;
}>;

export type KakaoV4PartySyncPayload = Readonly<{
  members: readonly RecruitMember[];
  startTimeText?: string | null;
  gameInfo?: string | null;
  scheduledStartAt?: string | null;
}>;

export type KakaoV4SeasonParticipant = Readonly<{
  slotNo: number;
  name: string;
  riotId: string | null;
  mainPosition: SeasonApplicationPosition;
  subPositions: readonly SeasonApplicationPosition[];
  reserve: boolean;
}>;

/**
 * Output contract of the classifier and input contract of the dispatcher.
 * This module intentionally contains no text parsing or command aliases.
 */
export type CanonicalKakaoV4Command =
  | Readonly<{ domain: "PARTY"; action: "CREATE"; payload: KakaoV4PartyCreatePayload }>
  | Readonly<{ domain: "PARTY"; action: "STATUS" }>
  | Readonly<{ domain: "PARTY"; action: "DETAIL"; target: KakaoV4RecruitTarget }>
  | Readonly<{ domain: "PARTY"; action: "SYNC"; target: KakaoV4RecruitTarget; payload: KakaoV4PartySyncPayload }>
  | Readonly<{ domain: "PARTY"; action: "FINISH"; target: KakaoV4RecruitTarget }>
  | Readonly<{ domain: "SCRIM"; action: "CREATE"; payload: ScrimFormCommandPayload }>
  | Readonly<{ domain: "SCRIM"; action: "STATUS" }>
  | Readonly<{ domain: "SCRIM"; action: "DETAIL"; target: KakaoV4RecruitTarget }>
  | Readonly<{ domain: "SCRIM"; action: "SYNC"; target: KakaoV4RecruitTarget; payload: SyncScrimCommandPayload }>
  | Readonly<{ domain: "SCRIM"; action: "DEPRECATED_JOIN" | "DEPRECATED_CONFIRM" | "DEPRECATED_CANCEL" | "DEPRECATED_FINISH" }>
  | Readonly<{ domain: "SEASON"; action: "STATUS"; seasonId: string; applyDate: string }>
  | Readonly<{ domain: "SEASON"; action: "DETAIL"; seasonId: string; applyDate: string; recruitNumber: number }>
  | Readonly<{
      domain: "SEASON";
      action: "SYNC";
      seasonId: string;
      applyDate: string;
      recruitNumber: number;
      mode: "RIFT";
      participants: readonly KakaoV4SeasonParticipant[];
    }>;

export function requiredProfileForKakaoV4Command(command: CanonicalKakaoV4Command) {
  return command.domain === "SEASON" ? "FEATURES" as const : "RECRUIT" as const;
}
