import { canonicalIdentifier, validateCompetitionRoster, type CompetitionPosition } from "../core";
import { requireCompetition } from "../core/error";
import type { DestructionParticipant } from "./teams";

export type DestructionRosterSnapshotMember = Readonly<{
  participantId: string;
  playerId: string;
  position: CompetitionPosition;
  isCaptain: boolean;
}>;

export type DestructionFixtureRosterSnapshot = Readonly<{
  fixtureId: string;
  capturedAt: string;
  teamAId: string;
  teamBId: string;
  teamA: readonly DestructionRosterSnapshotMember[];
  teamB: readonly DestructionRosterSnapshotMember[];
}>;

export type DestructionReplacement = Readonly<{
  id: string;
  participantId: string;
  teamId: string;
  outgoingPlayerId: string;
  incomingPlayerId: string;
  outgoingPosition: CompetitionPosition;
  incomingPosition: CompetitionPosition;
  reason: string;
  effectiveAt: string;
}>;

function canonicalInstant(value: string) {
  const time = Date.parse(value);
  requireCompetition(Number.isFinite(time) && new Date(time).toISOString() === value, "PRECONDITION_FAILED", "Roster timestamps must be canonical ISO instants.");
}

export function captureFixtureRosterSnapshot(input: Readonly<{
  fixtureId: string;
  teamAId: string;
  teamBId: string;
  participants: readonly DestructionParticipant[];
  capturedAt: string;
}>): DestructionFixtureRosterSnapshot {
  canonicalIdentifier(input.fixtureId, "fixtureId");
  canonicalIdentifier(input.teamAId, "teamAId");
  canonicalIdentifier(input.teamBId, "teamBId");
  requireCompetition(input.teamAId !== input.teamBId, "INVALID_FIXTURE", "A fixture cannot contain the same team twice.");
  canonicalInstant(input.capturedAt);
  const snapshotTeam = (teamId: string) => {
    const members = input.participants
      .filter((participant) => participant.teamId === teamId)
      .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
      .map((participant) => Object.freeze({
        participantId: participant.id,
        playerId: participant.playerId,
        position: participant.position,
        isCaptain: participant.isCaptain,
      }));
    validateCompetitionRoster({ format: "POSITIONAL", members, requireCaptain: true });
    return Object.freeze(members);
  };
  return Object.freeze({
    fixtureId: input.fixtureId,
    capturedAt: input.capturedAt,
    teamAId: input.teamAId,
    teamBId: input.teamBId,
    teamA: snapshotTeam(input.teamAId),
    teamB: snapshotTeam(input.teamBId),
  });
}

export function replaceDestructionParticipant(input: Readonly<{
  replacementId: string;
  participantId: string;
  incomingPlayerId: string;
  incomingPosition: CompetitionPosition;
  reason: string;
  effectiveAt: string;
  participants: readonly DestructionParticipant[];
  replacements: readonly DestructionReplacement[];
  fixtureSnapshots: readonly DestructionFixtureRosterSnapshot[];
}>) {
  canonicalIdentifier(input.replacementId, "replacementId");
  canonicalIdentifier(input.participantId, "participantId");
  canonicalIdentifier(input.incomingPlayerId, "incomingPlayerId");
  canonicalInstant(input.effectiveAt);
  requireCompetition(!input.replacements.some((entry) => entry.id === input.replacementId), "DUPLICATE_ID", "Replacement IDs are append-only and unique.");
  const participant = input.participants.find((entry) => entry.id === input.participantId);
  requireCompetition(participant?.teamId, "PRECONDITION_FAILED", "Only a currently assigned participant may be replaced.");
  requireCompetition(!input.participants.some((entry) => entry.playerId === input.incomingPlayerId), "DUPLICATE_ID", "The incoming player already participates in this competition.");
  const reason = input.reason.normalize("NFKC").trim().replace(/\s+/gu, " ");
  requireCompetition(reason.length >= 2 && reason.length <= 500, "PRECONDITION_FAILED", "A replacement reason between two and 500 characters is required.");
  const replacement: DestructionReplacement = Object.freeze({
    id: input.replacementId,
    participantId: participant.id,
    teamId: participant.teamId,
    outgoingPlayerId: participant.playerId,
    incomingPlayerId: input.incomingPlayerId,
    outgoingPosition: participant.position,
    incomingPosition: input.incomingPosition,
    reason,
    effectiveAt: input.effectiveAt,
  });
  const participants = Object.freeze(input.participants.map((entry) => entry.id === participant.id ? Object.freeze({ ...entry, playerId: input.incomingPlayerId, position: input.incomingPosition }) : entry));
  const teamMembers = participants.filter((entry) => entry.teamId === participant.teamId).map((entry) => ({
    participantId: entry.id,
    playerId: entry.playerId,
    position: entry.position,
    isCaptain: entry.isCaptain,
  }));
  validateCompetitionRoster({ format: "POSITIONAL", members: teamMembers, requireCaptain: true });
  const replacements = Object.freeze([...input.replacements, replacement]);
  // Existing snapshots are deliberately returned by reference: replacements only affect fixtures captured later.
  return Object.freeze({ participants, replacements, fixtureSnapshots: input.fixtureSnapshots });
}
