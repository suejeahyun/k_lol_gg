import {
  COMPETITION_POSITIONS,
  canonicalIdentifier,
  validateCompetitionRoster,
  type CompetitionPosition,
} from "../core";
import { requireCompetition } from "../core/error";

export type DestructionParticipant = Readonly<{
  id: string;
  playerId: string;
  position: CompetitionPosition;
  isCaptain: boolean;
  teamId: string | null;
  auctionStatus: "PENDING" | "DRAWN" | "HOLD" | "SOLD" | "ASSIGNED";
  purchasePoints: number | null;
  drawOrder: number | null;
}>;

export type DestructionTeam = Readonly<{
  id: string;
  name: string;
  captainParticipantId: string;
  initialAuctionPoints: number;
  remainingAuctionPoints: number;
  confirmed: boolean;
}>;

export type CaptainSelection = Readonly<{
  teamId: string;
  name: string;
  participantId: string;
  initialAuctionPoints: number;
}>;

export function confirmDestructionTeams(
  participants: readonly DestructionParticipant[],
  selections: readonly CaptainSelection[],
): Readonly<{ teams: readonly DestructionTeam[]; participants: readonly DestructionParticipant[] }> {
  requireCompetition(selections.length >= 4 && participants.length === selections.length * 5, "PRECONDITION_FAILED", "Confirmed teams require exactly five participants per team.");
  const participantById = new Map(participants.map((participant) => [participant.id, participant]));
  requireCompetition(participantById.size === participants.length, "DUPLICATE_ID", "Participant IDs must be unique.");
  requireCompetition(new Set(participants.map((participant) => participant.playerId)).size === participants.length, "DUPLICATE_ID", "Player IDs must be unique.");
  const teamIds = new Set<string>();
  const captainIds = new Set<string>();
  const names = new Set<string>();
  const teams: DestructionTeam[] = [];
  for (const selection of selections) {
    canonicalIdentifier(selection.teamId, "teamId");
    canonicalIdentifier(selection.participantId, "captainParticipantId");
    const name = selection.name.normalize("NFKC").trim().replace(/\s+/gu, " ");
    requireCompetition(name.length >= 1 && name.length <= 50, "PRECONDITION_FAILED", "Team names must contain between one and 50 characters.");
    requireCompetition(!teamIds.has(selection.teamId) && !captainIds.has(selection.participantId) && !names.has(name), "DUPLICATE_ID", "Team IDs, names, and captains must be unique.");
    requireCompetition(Number.isSafeInteger(selection.initialAuctionPoints) && selection.initialAuctionPoints >= 0 && selection.initialAuctionPoints <= 1_000_000, "PRECONDITION_FAILED", "Initial auction points must be between zero and one million.");
    const captain = participantById.get(selection.participantId);
    requireCompetition(captain && captain.teamId === null, "PRECONDITION_FAILED", "Every captain must be an unassigned participant.");
    teamIds.add(selection.teamId);
    captainIds.add(selection.participantId);
    names.add(name);
    teams.push(Object.freeze({
      id: selection.teamId,
      name,
      captainParticipantId: selection.participantId,
      initialAuctionPoints: selection.initialAuctionPoints,
      remainingAuctionPoints: selection.initialAuctionPoints,
      confirmed: true,
    }));
  }
  const captainTeamByParticipantId = new Map(selections.map((selection) => [selection.participantId, selection.teamId]));
  const assignedParticipants = participants.map((participant) => {
    canonicalIdentifier(participant.id, "participantId");
    canonicalIdentifier(participant.playerId, "playerId");
    requireCompetition(COMPETITION_POSITIONS.includes(participant.position), "INVALID_ROSTER", "Every participant needs a competition position.");
    requireCompetition(participant.teamId === null && participant.auctionStatus === "PENDING", "INVALID_TRANSITION", "Team confirmation starts from an unassigned participant pool.");
    const teamId = captainTeamByParticipantId.get(participant.id) ?? null;
    return Object.freeze({
      ...participant,
      teamId,
      isCaptain: teamId !== null,
      auctionStatus: teamId === null ? "PENDING" as const : "ASSIGNED" as const,
      purchasePoints: teamId === null ? null : 0,
    });
  });
  return Object.freeze({
    teams: Object.freeze(teams.sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0)),
    participants: Object.freeze(assignedParticipants.sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0)),
  });
}
export function validateConfirmedDestructionRosters(
  teams: readonly DestructionTeam[],
  participants: readonly DestructionParticipant[],
) {
  for (const team of teams) {
    validateCompetitionRoster({
      format: "POSITIONAL",
      requireCaptain: true,
      members: participants.filter((participant) => participant.teamId === team.id).map((participant) => ({
        participantId: participant.id,
        playerId: participant.playerId,
        position: participant.position,
        isCaptain: participant.isCaptain,
      })),
    });
  }
  return true;
}
