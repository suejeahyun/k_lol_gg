import type { SeasonApplicationPosition } from "@/modules/seasons/domain/season";

import type { ScrimFormCommandPayload, SyncScrimCommandPayload } from "../application/commands";
import type { RecruitMember, RecruitPartyType } from "../domain/recruiting";
import type { KakaoV4CommandClassification } from "./classifier";
import type { KakaoV4CommandEnvelope } from "./domain";

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
    }>
  | Readonly<{ domain: "PLAYER"; action: "RECORD" | "RECENT"; query: string }>
  | Readonly<{ domain: "PLAYER"; action: "RANKING" }>;

export function requiredProfileForKakaoV4Command(command: CanonicalKakaoV4Command) {
  return command.domain === "SEASON" || command.domain === "PLAYER" ? "FEATURES" as const : "RECRUIT" as const;
}

function kstDate(timestamp: number) {
  return new Date((timestamp + 9 * 60 * 60) * 1_000).toISOString().slice(0, 10);
}

function numberParameter(parameters: Readonly<Record<string, string | number | boolean | null>>, key: string) {
  const value = parameters[key];
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function textParameter(parameters: Readonly<Record<string, string | number | boolean | null>>, key: string) {
  const value = parameters[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function snapshotMembers(text: string): readonly RecruitMember[] {
  const members: RecruitMember[] = [];
  for (const line of text.split("\n")) {
    const match = /^\s*(예비\s*)?(\d+)\.\s*(.*?)\s*$/u.exec(line);
    if (!match?.[3]) continue;
    members.push(Object.freeze({ slotNo: Number(match[2]), name: match[3], position: null, substitute: Boolean(match[1]) }));
  }
  return Object.freeze(members);
}

export function canonicalizeKakaoV4Command(classification: KakaoV4CommandClassification, envelope: KakaoV4CommandEnvelope): CanonicalKakaoV4Command | null {
  if (classification.kind === "UNKNOWN" || classification.kind === "WRONG_PROFILE") return null;
  const date = kstDate(envelope.timestamp);
  const parameters = classification.parameters;
  if (classification.command === "PARTY_CREATE") {
    const partyType = (textParameter(parameters, "partyType") ?? "PARTY_NUMBER") as RecruitPartyType;
    const maximumMembers = numberParameter(parameters, "maximumMembers") ?? 5;
    return Object.freeze({ domain: "PARTY" as const, action: "CREATE" as const, payload: Object.freeze({
      recruitDate: date, preferredRecruitNumber: numberParameter(parameters, "explicitRecruitNumber"), partyType,
      title: partyType === "PARTY_NUMBER" ? `${maximumMembers}인 파티` : classification.canonicalText,
      maximumMembers, members: Object.freeze([]), startTimeText: null, gameInfo: null,
      scheduledStartAt: null, protectedUntil: null,
    }) });
  }
  if (classification.command === "PARTY_STATUS") return Object.freeze({ domain: "PARTY" as const, action: "STATUS" as const });
  if (classification.command === "PARTY_DETAIL" || classification.command === "PARTY_FINISH") {
    const recruitNumber = numberParameter(parameters, "recruitNumber");
    if (!recruitNumber) return null;
    return Object.freeze({ domain: "PARTY" as const, action: classification.command === "PARTY_DETAIL" ? "DETAIL" as const : "FINISH" as const, target: Object.freeze({ recruitDate: date, recruitNumber }) });
  }
  if (classification.command === "PARTY_SNAPSHOT") {
    const recruitNumber = numberParameter(parameters, "recruitNumber");
    if (!recruitNumber) return null;
    return Object.freeze({ domain: "PARTY" as const, action: "SYNC" as const, target: Object.freeze({ recruitDate: date, recruitNumber }), payload: Object.freeze({ members: snapshotMembers(envelope.text) }) });
  }
  if (classification.command === "SCRIM_STATUS") return Object.freeze({ domain: "SCRIM" as const, action: "STATUS" as const });
  if (classification.command === "SCRIM_DETAIL") {
    const recruitNumber = numberParameter(parameters, "scrimNumber");
    return recruitNumber ? Object.freeze({ domain: "SCRIM" as const, action: "DETAIL" as const, target: Object.freeze({ recruitDate: date, recruitNumber }) }) : null;
  }
  if (classification.command.startsWith("SCRIM_LEGACY_")) {
    const action = classification.command.slice("SCRIM_LEGACY_".length) as "JOIN" | "CONFIRM" | "CANCEL" | "FINISH";
    return Object.freeze({ domain: "SCRIM" as const, action: `DEPRECATED_${action}` as const });
  }
  if (classification.command === "PLAYER_RECORD" || classification.command === "PLAYER_RECENT") {
    const query = textParameter(parameters, "riotId");
    return query ? Object.freeze({ domain: "PLAYER" as const, action: classification.command === "PLAYER_RECORD" ? "RECORD" as const : "RECENT" as const, query }) : null;
  }
  if (classification.command === "PLAYER_RANKING") return Object.freeze({ domain: "PLAYER" as const, action: "RANKING" as const });
  return null;
}
