import { canonicalIdentifier, requireCompetition } from "./error";

export const COMPETITION_POSITIONS = ["TOP", "JGL", "MID", "ADC", "SUP"] as const;
export type CompetitionPosition = (typeof COMPETITION_POSITIONS)[number];

export type CompetitionRosterMember = Readonly<{
  participantId: string;
  playerId: string;
  position: CompetitionPosition | null;
  isCaptain?: boolean;
}>;

export type CompetitionRoster = Readonly<{
  format: "POSITIONAL" | "ARAM";
  members: readonly CompetitionRosterMember[];
  requireCaptain?: boolean;
}>;

export function validateCompetitionRoster(roster: CompetitionRoster) {
  requireCompetition(roster.format === "POSITIONAL" || roster.format === "ARAM", "INVALID_ROSTER", "Roster format is invalid.");
  requireCompetition(roster.members.length === 5, "INVALID_ROSTER", "A roster must contain exactly five members.");

  const participantIds = new Set<string>();
  const playerIds = new Set<string>();
  for (const member of roster.members) {
    canonicalIdentifier(member.participantId, "participantId");
    canonicalIdentifier(member.playerId, "playerId");
    requireCompetition(
      member.position === null || COMPETITION_POSITIONS.includes(member.position),
      "INVALID_ROSTER",
      "Roster position is invalid.",
    );
    requireCompetition(
      member.isCaptain === undefined || typeof member.isCaptain === "boolean",
      "INVALID_ROSTER",
      "Captain flags must be boolean when present.",
    );
    requireCompetition(!participantIds.has(member.participantId), "DUPLICATE_ID", "A participant cannot occupy two roster slots.");
    requireCompetition(!playerIds.has(member.playerId), "DUPLICATE_ID", "A player cannot occupy two roster slots.");
    participantIds.add(member.participantId);
    playerIds.add(member.playerId);
  }

  if (roster.format === "POSITIONAL") {
    const positions = roster.members.map((member) => member.position);
    requireCompetition(
      COMPETITION_POSITIONS.every((position) => positions.filter((entry) => entry === position).length === 1),
      "INVALID_ROSTER",
      "A positional roster needs exactly one TOP, JGL, MID, ADC, and SUP.",
    );
  }

  if (roster.requireCaptain) {
    requireCompetition(
      roster.members.filter((member) => member.isCaptain === true).length === 1,
      "INVALID_ROSTER",
      "A destruction roster needs exactly one captain.",
    );
  }

  return Object.freeze({
    ...roster,
    members: Object.freeze(roster.members.map((member) => Object.freeze({ ...member }))),
  });
}
