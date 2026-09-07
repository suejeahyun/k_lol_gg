import { compareCanonicalIdentifiers, requireCompetition } from "../core/error";
import type { DestructionParticipant, DestructionTeam } from "./teams";

export type DestructionAuctionState = Readonly<{
  seed: string;
  teams: readonly DestructionTeam[];
  participants: readonly DestructionParticipant[];
}>;

function seededIndex(seed: string, drawOrder: number, pool: readonly DestructionParticipant[]) {
  requireCompetition(seed.length >= 8 && seed.length <= 128, "PRECONDITION_FAILED", "An explicit auction seed between eight and 128 characters is required.");
  let hash = 2_166_136_261;
  const material = `${seed}\u0000${drawOrder}\u0000${pool.map((entry) => entry.id).join("\u0000")}`;
  for (let index = 0; index < material.length; index += 1) {
    hash ^= material.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619) >>> 0;
  }
  return hash % pool.length;
}
function assertAuctionState(state: DestructionAuctionState) {
  const teamIds = new Set(state.teams.map((team) => team.id));
  const playerIds = new Set<string>();
  requireCompetition(teamIds.size === state.teams.length, "DUPLICATE_ID", "Auction teams must be unique.");
  requireCompetition(state.participants.filter((entry) => entry.auctionStatus === "DRAWN").length <= 1, "INVALID_TRANSITION", "At most one participant may be drawn.");
  for (const team of state.teams) {
    requireCompetition(Number.isSafeInteger(team.remainingAuctionPoints) && team.remainingAuctionPoints >= 0 && team.remainingAuctionPoints <= team.initialAuctionPoints, "PRECONDITION_FAILED", "Team auction balances must stay within their initial balance.");
    const roster = state.participants.filter((participant) => participant.teamId === team.id);
    requireCompetition(roster.length <= 5, "INVALID_ROSTER", "A team cannot exceed five participants.");
    requireCompetition(new Set(roster.map((member) => member.position)).size === roster.length, "INVALID_ROSTER", "A team cannot contain duplicate positions.");
  }
  for (const participant of state.participants) {
    requireCompetition(!playerIds.has(participant.playerId), "DUPLICATE_ID", "A player cannot appear twice in the auction.");
    playerIds.add(participant.playerId);
    if (participant.teamId !== null) requireCompetition(teamIds.has(participant.teamId), "PRECONDITION_FAILED", "Assigned participants must reference an auction team.");
    if (participant.auctionStatus === "SOLD" || participant.auctionStatus === "ASSIGNED") {
      requireCompetition(participant.teamId !== null && participant.purchasePoints !== null, "PRECONDITION_FAILED", "Sold and assigned participants require a team and purchase value.");
    } else {
      requireCompetition(participant.teamId === null && participant.purchasePoints === null, "PRECONDITION_FAILED", "Unassigned participants cannot retain a team or purchase value.");
    }
  }
}

function freezeAuction(state: DestructionAuctionState): DestructionAuctionState {
  const frozen = Object.freeze({
    seed: state.seed,
    teams: Object.freeze(state.teams.map((team) => Object.freeze({ ...team })).sort((left, right) => compareCanonicalIdentifiers(left.id, right.id))),
    participants: Object.freeze(state.participants.map((participant) => Object.freeze({ ...participant })).sort((left, right) => compareCanonicalIdentifiers(left.id, right.id))),
  });
  assertAuctionState(frozen);
  return frozen;
}

export function drawAuctionParticipant(state: DestructionAuctionState) {
  assertAuctionState(state);
  requireCompetition(!state.participants.some((entry) => entry.auctionStatus === "DRAWN"), "INVALID_TRANSITION", "Resolve the current draw before drawing again.");
  const pending = state.participants.filter((entry) => !entry.isCaptain && entry.auctionStatus === "PENDING" && entry.teamId === null);
  const held = state.participants.filter((entry) => !entry.isCaptain && entry.auctionStatus === "HOLD" && entry.teamId === null);
  const pool = [...(pending.length > 0 ? pending : held)].sort((left, right) => compareCanonicalIdentifiers(left.id, right.id));
  requireCompetition(pool.length > 0, "PRECONDITION_FAILED", "No participant is available to draw.");
  const drawOrder = Math.max(0, ...state.participants.map((entry) => entry.drawOrder ?? 0)) + 1;
  const selected = pool[seededIndex(state.seed, drawOrder, pool)]!;
  return Object.freeze({
    state: freezeAuction({ ...state, participants: state.participants.map((entry) => entry.id === selected.id ? { ...entry, auctionStatus: "DRAWN", drawOrder } : entry) }),
    participantId: selected.id,
    drawOrder,
  });
}

export function holdAuctionParticipant(state: DestructionAuctionState, participantId: string) {
  assertAuctionState(state);
  const participant = state.participants.find((entry) => entry.id === participantId);
  requireCompetition(participant?.auctionStatus === "DRAWN", "INVALID_TRANSITION", "Only the currently drawn participant may be held.");
  return freezeAuction({ ...state, participants: state.participants.map((entry) => entry.id === participantId ? { ...entry, auctionStatus: "HOLD", teamId: null, purchasePoints: null } : entry) });
}

export function sellAuctionParticipant(
  state: DestructionAuctionState,
  input: Readonly<{ participantId: string; teamId: string; purchasePoints: number }>,
) {
  assertAuctionState(state);
  const participant = state.participants.find((entry) => entry.id === input.participantId);
  const team = state.teams.find((entry) => entry.id === input.teamId);
  requireCompetition(participant?.auctionStatus === "DRAWN", "INVALID_TRANSITION", "Only the currently drawn participant may be sold.");
  requireCompetition(team, "PRECONDITION_FAILED", "The auction team does not exist.");
  requireCompetition(Number.isSafeInteger(input.purchasePoints) && input.purchasePoints >= 1 && input.purchasePoints <= team.remainingAuctionPoints, "PRECONDITION_FAILED", "The purchase value must be positive and cannot exceed the team balance.");
  const roster = state.participants.filter((entry) => entry.teamId === team.id);
  requireCompetition(roster.length < 5, "INVALID_ROSTER", "The auction team is already full.");
  requireCompetition(!roster.some((entry) => entry.position === participant.position), "INVALID_ROSTER", "The auction team already has this position.");
  return freezeAuction({
    ...state,
    teams: state.teams.map((entry) => entry.id === team.id ? { ...entry, remainingAuctionPoints: entry.remainingAuctionPoints - input.purchasePoints } : entry),
    participants: state.participants.map((entry) => entry.id === participant.id ? { ...entry, teamId: team.id, auctionStatus: "SOLD", purchasePoints: input.purchasePoints } : entry),
  });
}

export function isAuctionComplete(state: DestructionAuctionState) {
  assertAuctionState(state);
  return state.participants.every((entry) => entry.auctionStatus === "SOLD" || entry.auctionStatus === "ASSIGNED");
}
