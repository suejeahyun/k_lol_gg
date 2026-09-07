import {
  advanceSingleEliminationBracket,
  buildGroupRoundRobinFixtures,
  buildRoundRobinFixtures,
  buildSingleEliminationBracket,
  INITIAL_DESTRUCTION_LIFECYCLE,
  transitionDestructionLifecycle,
  validateBestOfResult,
  validateCompetitionAuditEvent,
  validateCompetitionCommandReceipt,
  validateCompetitionOutboxEvent,
  type CompetitionAuditEvent,
  type CompetitionCommandReceipt,
  type CompetitionOutboxEvent,
  type JsonObject,
  type SingleEliminationBracket,
  type StandingsFixture,
} from "../core";
import { requireCompetition } from "../core/error";
import {
  drawAuctionParticipant,
  holdAuctionParticipant,
  isAuctionComplete,
  sellAuctionParticipant,
} from "./auction";
import { calculateCaptainAuctionPoints } from "./captain-points";
import {
  destructionAdminMinimumRole,
  destructionCommandRequestFingerprint,
  type DestructionHttpCommand,
  type DestructionHttpMutationBody,
  type DestructionMutationResult,
} from "./http-contract";
import { assignDestructionMvp, castDestructionMvpVote, createDestructionMvpBallot, resetDestructionMvp } from "./mvp-voting";
import { cancelDestructionApplication } from "./recruitment";
import { captureFixtureRosterSnapshot, replaceDestructionParticipant } from "./roster-history";
import { rebuildDestructionPreliminaryProjection } from "./standings";
import { applyDestructionTerminalCommand, type DestructionAggregate } from "./state";
import { confirmDestructionTeams, validateConfirmedDestructionRosters } from "./teams";

export interface DestructionTransactionContext { readonly destructionTransaction: unique symbol }

export type DestructionReceiptClaim =
  | Readonly<{ kind: "CLAIMED" }>
  | Readonly<{ kind: "MISMATCH" }>
  | Readonly<{ kind: "REPLAY"; receipt: CompetitionCommandReceipt<DestructionHttpMutationBody> }>;

export interface DestructionCommandHandlerDependencies {
  unitOfWork: { transaction<T>(operation: (transaction: DestructionTransactionContext) => Promise<T>): Promise<T> };
  repository: {
    loadForUpdate(transaction: DestructionTransactionContext, tournamentId: string): Promise<DestructionAggregate | null>;
    assertPublishedReadyGallery(transaction: DestructionTransactionContext, galleryId: string): Promise<void>;
    save(transaction: DestructionTransactionContext, input: Readonly<{ aggregate: DestructionAggregate; expectedRevision: number; create: boolean }>): Promise<void>;
  };
  authorization: {
    /** Re-reads session/authVersion, approval/ownership, role and TOTP in the mutation transaction. */
    recheck(transaction: DestructionTransactionContext, command: DestructionHttpCommand): Promise<void>;
  };
  receipts: {
    claim(transaction: DestructionTransactionContext, command: DestructionHttpCommand): Promise<DestructionReceiptClaim>;
    complete(transaction: DestructionTransactionContext, receipt: CompetitionCommandReceipt<DestructionHttpMutationBody>): Promise<void>;
  };
  audit: { append(transaction: DestructionTransactionContext, event: CompetitionAuditEvent): Promise<void> };
  outbox: { append(transaction: DestructionTransactionContext, event: CompetitionOutboxEvent): Promise<void> };
  clock: { now(): string; receiptExpiresAt(now: string): string };
}

function updated(aggregate: DestructionAggregate, now: string, fields: Partial<DestructionAggregate>): DestructionAggregate {
  return Object.freeze({ ...aggregate, ...fields, updatedAt: now });
}

function createAggregate(command: Extract<DestructionHttpCommand, { type: "CREATE_DESTRUCTION" }>, now: string): DestructionAggregate {
  return Object.freeze({
    id: command.tournamentId,
    revision: 0,
    title: command.payload.title,
    lifecycle: INITIAL_DESTRUCTION_LIFECYCLE,
    configuration: command.payload.configuration,
    applications: Object.freeze([]),
    teams: Object.freeze([]),
    participants: Object.freeze([]),
    auctionSeed: null,
    preliminaryFixtures: Object.freeze([]),
    qualifiedTeamIds: Object.freeze([]),
    tournamentBracket: null,
    rosterSnapshots: Object.freeze([]),
    replacements: Object.freeze([]),
    mvpBallots: Object.freeze([]),
    galleryId: null,
    createdAt: now,
    updatedAt: now,
  });
}

function pendingFixture(fixture: Readonly<{ id: string; groupKey: string | null; bestOf: number; teamAId: string; teamBId: string }>): StandingsFixture {
  return Object.freeze({ id: fixture.id, groupKey: fixture.groupKey, status: "PENDING", confirmed: false, bestOf: fixture.bestOf, teamAId: fixture.teamAId, teamBId: fixture.teamBId, teamAScore: null, teamBScore: null, winnerTeamId: null });
}

function buildPreliminaryFixtures(aggregate: DestructionAggregate) {
  const teams = aggregate.teams.map((team) => ({ id: team.id }));
  const { preliminaryMode: mode, preliminaryBestOf: bestOf } = aggregate.configuration;
  if (mode === "GROUP_ROUND_ROBIN") {
    const midpoint = Math.ceil(teams.length / 2);
    return buildGroupRoundRobinFixtures({ competitionId: aggregate.id, groups: [{ key: "A", teams: teams.slice(0, midpoint) }, { key: "B", teams: teams.slice(midpoint) }], bestOf }).map(pendingFixture);
  }
  const complete = buildRoundRobinFixtures({ competitionId: aggregate.id, teams, bestOf });
  if (mode === "FULL_ROUND_ROBIN") return complete.map(pendingFixture);
  const maxRound = Math.max(...complete.map((fixture) => fixture.roundNumber));
  return Object.freeze(Array.from({ length: aggregate.configuration.preliminaryRoundCount }, (_, roundIndex) => {
    const sourceRound = (roundIndex % maxRound) + 1;
    return complete.filter((fixture) => fixture.roundNumber === sourceRound).map((fixture) => pendingFixture({ ...fixture, id: `${aggregate.id}:${mode}:R${roundIndex + 1}:M${fixture.slotNumber}` }));
  }).flat());
}

function withResult(fixtures: readonly StandingsFixture[], payload: Readonly<{ fixtureId: string; teamAScore: number; teamBScore: number; winnerTeamId: string }>, correction: boolean) {
  const target = fixtures.find((fixture) => fixture.id === payload.fixtureId);
  requireCompetition(target, "PRECONDITION_FAILED", "The preliminary fixture does not exist.");
  requireCompetition(correction ? target.status === "COMPLETED" : target.status === "PENDING", "INVALID_TRANSITION", correction ? "Only a completed preliminary result may be corrected." : "The preliminary result is already recorded.");
  const result = validateBestOfResult({ bestOf: target.bestOf, teamAId: target.teamAId, teamBId: target.teamBId, teamAScore: payload.teamAScore, teamBScore: payload.teamBScore, winnerTeamId: payload.winnerTeamId });
  if (correction) requireCompetition(target.teamAScore !== result.teamAScore || target.teamBScore !== result.teamBScore || target.winnerTeamId !== result.winnerTeamId, "INVALID_RESULT", "A correction must change the stored result.");
  return Object.freeze(fixtures.map((fixture) => fixture.id === target.id ? Object.freeze({ ...fixture, status: "COMPLETED" as const, confirmed: true, teamAScore: result.teamAScore, teamBScore: result.teamBScore, winnerTeamId: result.winnerTeamId }) : fixture));
}

function downstreamFixtureIds(bracket: SingleEliminationBracket, fixtureId: string) {
  const downstream = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const fixture of bracket.fixtures) {
      const sources = [fixture.sourceA, fixture.sourceB].flatMap((source) => source.kind === "WINNER" ? [source.sourceFixtureId] : []);
      if (sources.some((id) => id === fixtureId || downstream.has(id)) && !downstream.has(fixture.id)) { downstream.add(fixture.id); changed = true; }
    }
  }
  return downstream;
}

function correctBracket(bracket: SingleEliminationBracket, payload: Readonly<{ fixtureId: string; teamAScore: number; teamBScore: number; winnerTeamId: string }>) {
  const original = bracket.fixtures.find((fixture) => fixture.id === payload.fixtureId);
  requireCompetition(original?.result, "PRECONDITION_FAILED", "Only a completed tournament result may be corrected.");
  requireCompetition(original.result.teamAScore !== payload.teamAScore || original.result.teamBScore !== payload.teamBScore || original.result.winnerTeamId !== payload.winnerTeamId, "INVALID_RESULT", "A correction must change the stored result.");
  const downstream = original.result.winnerTeamId === payload.winnerTeamId ? new Set<string>() : downstreamFixtureIds(bracket, original.id);
  let rebuilt = buildSingleEliminationBracket({ competitionId: bracket.competitionId, teams: bracket.teams.map((team) => ({ id: team.id, seed: team.seed })), bestOf: bracket.fixtures[0]!.bestOf });
  for (const fixture of bracket.fixtures) {
    if (fixture.id === original.id) rebuilt = advanceSingleEliminationBracket(rebuilt, payload).bracket;
    else if (fixture.result && !downstream.has(fixture.id)) rebuilt = advanceSingleEliminationBracket(rebuilt, { fixtureId: fixture.id, teamAScore: fixture.result.teamAScore, teamBScore: fixture.result.teamBScore, winnerTeamId: fixture.result.winnerTeamId }).bracket;
  }
  return { bracket: rebuilt, invalidated: new Set([original.id, ...downstream]) };
}

function fixtureTeams(aggregate: DestructionAggregate, fixtureId: string) {
  const preliminary = aggregate.preliminaryFixtures.find((fixture) => fixture.id === fixtureId);
  if (preliminary) return { teamAId: preliminary.teamAId, teamBId: preliminary.teamBId };
  const tournament = aggregate.tournamentBracket?.fixtures.find((fixture) => fixture.id === fixtureId);
  requireCompetition(tournament?.teamAId && tournament.teamBId, "PRECONDITION_FAILED", "The fixture does not have two resolved teams.");
  return { teamAId: tournament.teamAId, teamBId: tournament.teamBId };
}

function ensureRosterSnapshotAndBallot(aggregate: DestructionAggregate, fixtureId: string, now: string, resetBallot: boolean) {
  let snapshots = aggregate.rosterSnapshots;
  let snapshot = snapshots.find((entry) => entry.fixtureId === fixtureId);
  if (!snapshot) {
    const teams = fixtureTeams(aggregate, fixtureId);
    snapshot = captureFixtureRosterSnapshot({ fixtureId, ...teams, participants: aggregate.participants, capturedAt: now });
    snapshots = Object.freeze([...snapshots, snapshot]);
  }
  const participantPlayerIds = [...snapshot.teamA, ...snapshot.teamB].map((member) => member.playerId);
  const existing = aggregate.mvpBallots.find((ballot) => ballot.fixtureId === fixtureId);
  const ballot = !existing || resetBallot ? createDestructionMvpBallot(fixtureId, participantPlayerIds) : existing;
  return { rosterSnapshots: snapshots, mvpBallots: Object.freeze([...aggregate.mvpBallots.filter((entry) => entry.fixtureId !== fixtureId), ballot]) };
}

function applyCommand(current: DestructionAggregate | null, command: DestructionHttpCommand, now: string): DestructionAggregate {
  if (command.type === "CREATE_DESTRUCTION") {
    requireCompetition(current === null, "DUPLICATE_ID", "The destruction competition already exists.");
    return createAggregate(command, now);
  }
  requireCompetition(current, "PRECONDITION_FAILED", "The destruction competition does not exist.");

  switch (command.type) {
    case "UPSERT_OWN_APPLICATION": {
      requireCompetition(current.lifecycle.status === "RECRUITING", "INVALID_TRANSITION", "Applications are open only during recruitment.");
      const existing = current.applications.find((entry) => entry.userAccountId === command.metadata.authorizationIntent.ownerUserAccountId);
      requireCompetition(!existing || (existing.id === command.payload.applicationId && existing.playerId === command.payload.playerId), "DUPLICATE_ID", "Application identity cannot be moved to another player or ID.");
      requireCompetition(!current.applications.some((entry) => entry !== existing && (entry.id === command.payload.applicationId || entry.playerId === command.payload.playerId)), "DUPLICATE_ID", "The application or player already exists.");
      const next = Object.freeze({ id: command.payload.applicationId, userAccountId: command.metadata.authorizationIntent.ownerUserAccountId, playerId: command.payload.playerId, position: command.payload.position, status: "APPLIED" as const });
      return updated(current, now, { applications: Object.freeze([...current.applications.filter((entry) => entry !== existing), next]) });
    }
    case "CANCEL_OWN_APPLICATION": {
      requireCompetition(current.lifecycle.status === "RECRUITING", "INVALID_TRANSITION", "Applications may be cancelled only during recruitment.");
      const application = current.applications.find((entry) => entry.userAccountId === command.metadata.authorizationIntent.ownerUserAccountId && entry.playerId === command.payload.playerId);
      requireCompetition(application, "PRECONDITION_FAILED", "The owned application does not exist.");
      const cancelled = cancelDestructionApplication(application, { type: "CANCEL_APPLICATION", actorUserAccountId: command.metadata.authorizationIntent.ownerUserAccountId, applicationId: application.id, authorization: "OWNER" });
      return updated(current, now, { applications: Object.freeze(current.applications.map((entry) => entry.id === cancelled.id ? cancelled : entry)) });
    }
    case "CAST_MVP_VOTE": {
      requireCompetition(current.lifecycle.status === "PRELIMINARY" || current.lifecycle.status === "TOURNAMENT", "INVALID_TRANSITION", "MVP voting is open only during active fixtures.");
      const ballot = current.mvpBallots.find((entry) => entry.fixtureId === command.payload.fixtureId);
      requireCompetition(ballot, "PRECONDITION_FAILED", "A completed fixture ballot does not exist.");
      const voted = castDestructionMvpVote(ballot, { voterPlayerId: command.payload.voterPlayerId, candidatePlayerId: command.payload.candidatePlayerId }, now).ballot;
      return updated(current, now, { mvpBallots: Object.freeze(current.mvpBallots.map((entry) => entry.fixtureId === voted.fixtureId ? voted : entry)) });
    }
    case "START_RECRUITMENT": return updated(current, now, { lifecycle: transitionDestructionLifecycle(current.lifecycle, { type: "START_RECRUITMENT" }) });
    case "SET_APPLICATION_STATUS": {
      requireCompetition(current.lifecycle.status === "RECRUITING", "INVALID_TRANSITION", "Applications are reviewed only during recruitment.");
      const target = current.applications.find((entry) => entry.id === command.payload.applicationId);
      requireCompetition(target, "PRECONDITION_FAILED", "The application does not exist.");
      return updated(current, now, { applications: Object.freeze(current.applications.map((entry) => entry.id === target.id ? Object.freeze({ ...entry, status: command.payload.status }) : entry)) });
    }
    case "CLOSE_RECRUITMENT": {
      const confirmed = current.applications.filter((entry) => entry.status === "CONFIRMED");
      requireCompetition(confirmed.length === current.configuration.teamCount * 5, "PRECONDITION_FAILED", "Exactly five confirmed participants per team are required.");
      for (const position of ["TOP", "JGL", "MID", "ADC", "SUP"] as const) requireCompetition(confirmed.filter((entry) => entry.position === position).length === current.configuration.teamCount, "INVALID_ROSTER", `Exactly one ${position} participant per team is required.`);
      const participants = Object.freeze(confirmed.map((entry) => Object.freeze({ id: entry.id, playerId: entry.playerId, position: entry.position, isCaptain: false, teamId: null, auctionStatus: "PENDING" as const, purchasePoints: null, drawOrder: null })));
      return updated(current, now, { participants, lifecycle: transitionDestructionLifecycle(current.lifecycle, { type: "CLOSE_RECRUITMENT", participantsReady: true }) });
    }
    case "CONFIRM_TEAMS": {
      requireCompetition(current.lifecycle.status === "TEAM_BUILDING" && current.teams.length === 0, "INVALID_TRANSITION", "Captains are confirmed once during team building.");
      requireCompetition(command.payload.captains.length === current.configuration.teamCount, "PRECONDITION_FAILED", "The configured team count and captain count must match.");
      const confirmed = confirmDestructionTeams(current.participants, command.payload.captains.map((captain) => ({ ...captain, initialAuctionPoints: calculateCaptainAuctionPoints(captain.baselineValue) })));
      return updated(current, now, { ...confirmed, auctionSeed: command.payload.seed });
    }
    case "START_AUCTION": {
      requireCompetition(current.teams.length === current.configuration.teamCount && current.auctionSeed !== null, "PRECONDITION_FAILED", "Confirmed captains and an auction seed are required.");
      return updated(current, now, { lifecycle: transitionDestructionLifecycle(current.lifecycle, { type: "START_AUCTION", rostersValid: true }) });
    }
    case "DRAW_AUCTION": {
      requireCompetition(current.lifecycle.status === "AUCTION" && current.auctionSeed, "INVALID_TRANSITION", "The auction is not active.");
      const state = drawAuctionParticipant({ seed: current.auctionSeed, teams: current.teams, participants: current.participants }).state;
      return updated(current, now, { teams: state.teams, participants: state.participants });
    }
    case "HOLD_AUCTION": {
      requireCompetition(current.lifecycle.status === "AUCTION" && current.auctionSeed, "INVALID_TRANSITION", "The auction is not active.");
      const state = holdAuctionParticipant({ seed: current.auctionSeed, teams: current.teams, participants: current.participants }, command.payload.participantId);
      return updated(current, now, { teams: state.teams, participants: state.participants });
    }
    case "SELL_AUCTION": {
      requireCompetition(current.lifecycle.status === "AUCTION" && current.auctionSeed, "INVALID_TRANSITION", "The auction is not active.");
      const state = sellAuctionParticipant({ seed: current.auctionSeed, teams: current.teams, participants: current.participants }, command.payload);
      return updated(current, now, { teams: state.teams, participants: state.participants });
    }
    case "PUBLISH_PRELIMINARY": {
      requireCompetition(current.lifecycle.status === "AUCTION" && current.auctionSeed, "INVALID_TRANSITION", "Preliminaries publish after the auction.");
      requireCompetition(isAuctionComplete({ seed: current.auctionSeed, teams: current.teams, participants: current.participants }), "PRECONDITION_FAILED", "The auction is not complete.");
      validateConfirmedDestructionRosters(current.teams, current.participants);
      const preliminaryFixtures = buildPreliminaryFixtures(current);
      return updated(current, now, { preliminaryFixtures, lifecycle: transitionDestructionLifecycle(current.lifecycle, { type: "PUBLISH_PRELIMINARY", auctionComplete: true, fixturesReady: preliminaryFixtures.length > 0 }) });
    }
    case "RECORD_PRELIMINARY_RESULT":
    case "CORRECT_PRELIMINARY_RESULT": {
      requireCompetition(current.lifecycle.status === "PRELIMINARY", "INVALID_TRANSITION", "Preliminary results are changed during preliminaries.");
      const correction = command.type === "CORRECT_PRELIMINARY_RESULT";
      const preliminaryFixtures = withResult(current.preliminaryFixtures, command.payload, correction);
      const voteState = ensureRosterSnapshotAndBallot({ ...current, preliminaryFixtures }, command.payload.fixtureId, now, correction);
      return updated(current, now, { preliminaryFixtures, ...voteState });
    }
    case "PUBLISH_TOURNAMENT": {
      requireCompetition(current.lifecycle.status === "PRELIMINARY", "INVALID_TRANSITION", "The tournament publishes after preliminaries.");
      const projection = rebuildDestructionPreliminaryProjection({ competitionId: current.id, configuration: current.configuration, teamIds: current.teams.map((team) => team.id), fixtures: current.preliminaryFixtures });
      return updated(current, now, { qualifiedTeamIds: projection.qualifiedTeamIds, tournamentBracket: projection.tournamentBracket, lifecycle: transitionDestructionLifecycle(current.lifecycle, { type: "PUBLISH_TOURNAMENT", preliminaryComplete: true, finalistCount: projection.qualifiedTeamIds.length }) });
    }
    case "RECORD_TOURNAMENT_RESULT": {
      requireCompetition(current.lifecycle.status === "TOURNAMENT" && current.tournamentBracket, "INVALID_TRANSITION", "Tournament results are recorded during the tournament.");
      const advanced = advanceSingleEliminationBracket(current.tournamentBracket, command.payload);
      requireCompetition(!advanced.replayed, "INVALID_RESULT", "The result is already recorded.");
      const voteState = ensureRosterSnapshotAndBallot({ ...current, tournamentBracket: advanced.bracket }, command.payload.fixtureId, now, false);
      return updated(current, now, { tournamentBracket: advanced.bracket, ...voteState });
    }
    case "CORRECT_TOURNAMENT_RESULT": {
      requireCompetition(current.lifecycle.status === "TOURNAMENT" && current.tournamentBracket, "INVALID_TRANSITION", "Tournament results are corrected before completion.");
      const corrected = correctBracket(current.tournamentBracket, command.payload);
      const voteState = ensureRosterSnapshotAndBallot({ ...current, tournamentBracket: corrected.bracket, mvpBallots: current.mvpBallots.filter((ballot) => !corrected.invalidated.has(ballot.fixtureId)) }, command.payload.fixtureId, now, true);
      return updated(current, now, { tournamentBracket: corrected.bracket, ...voteState });
    }
    case "REPLACE_PARTICIPANT": {
      requireCompetition(current.lifecycle.status === "PRELIMINARY" || current.lifecycle.status === "TOURNAMENT", "INVALID_TRANSITION", "Roster replacements occur during active competition.");
      return updated(current, now, replaceDestructionParticipant({ ...command.payload, effectiveAt: now, participants: current.participants, replacements: current.replacements, fixtureSnapshots: current.rosterSnapshots }));
    }
    case "RESET_MVP": {
      const ballot = current.mvpBallots.find((entry) => entry.fixtureId === command.payload.fixtureId);
      requireCompetition(ballot, "PRECONDITION_FAILED", "The MVP ballot does not exist.");
      const reset = resetDestructionMvp(ballot);
      return updated(current, now, { mvpBallots: Object.freeze(current.mvpBallots.map((entry) => entry.fixtureId === reset.fixtureId ? reset : entry)) });
    }
    case "ASSIGN_MVP": {
      const ballot = current.mvpBallots.find((entry) => entry.fixtureId === command.payload.fixtureId);
      requireCompetition(ballot, "PRECONDITION_FAILED", "The MVP ballot does not exist.");
      const assigned = assignDestructionMvp(ballot, command.payload.playerId, now);
      return updated(current, now, { mvpBallots: Object.freeze(current.mvpBallots.map((entry) => entry.fixtureId === assigned.fixtureId ? assigned : entry)) });
    }
    case "SET_MEDIA_GALLERY": {
      requireCompetition(current.lifecycle.status === "TOURNAMENT" || current.lifecycle.status === "COMPLETED", "INVALID_TRANSITION", "A result gallery may be linked during or after the tournament.");
      return updated(current, now, { galleryId: command.payload.galleryId });
    }
    case "COMPLETE_DESTRUCTION": {
      const playedFixtureIds = [...current.preliminaryFixtures.filter((fixture) => fixture.status === "COMPLETED").map((fixture) => fixture.id), ...(current.tournamentBracket?.fixtures.filter((fixture) => fixture.resolution === "RESULT").map((fixture) => fixture.id) ?? [])];
      requireCompetition(playedFixtureIds.length > 0 && playedFixtureIds.every((fixtureId) => current.mvpBallots.some((ballot) => ballot.fixtureId === fixtureId && ballot.finalizedPlayerId)), "PRECONDITION_FAILED", "Every played fixture requires a finalized MVP vote before completion.");
      return updated(applyDestructionTerminalCommand(current, { type: "COMPLETE", finalResultConfirmed: true }), now, command.payload.galleryId === undefined ? {} : { galleryId: command.payload.galleryId });
    }
    case "CANCEL_DESTRUCTION": return updated(applyDestructionTerminalCommand(current, { type: "CANCEL", reason: command.payload.reason }), now, {});
    case "RESTORE_DESTRUCTION": return updated(applyDestructionTerminalCommand(current, { type: "RESTORE_CANCELLED" }), now, {});
  }
}

function stateJson(aggregate: DestructionAggregate): JsonObject {
  return { id: aggregate.id, revision: aggregate.revision, title: aggregate.title, status: aggregate.lifecycle.status, participantCount: aggregate.participants.length, teamCount: aggregate.teams.length, championTeamId: aggregate.tournamentBracket?.championTeamId ?? null };
}

function sameDigest(left: Uint8Array, right: Uint8Array) {
  return left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);
}

function expectedScope(command: DestructionHttpCommand) {
  if (command.type === "CREATE_DESTRUCTION") return "admin:destruction:create";
  if (command.metadata.authorizationIntent.kind === "ADMIN_TOTP") return `admin:destruction:${command.type.toLocaleLowerCase("en-US")}`;
  if (command.type === "UPSERT_OWN_APPLICATION") return "destruction:application:upsert";
  if (command.type === "CANCEL_OWN_APPLICATION") return "destruction:application:cancel";
  return "destruction:mvp:vote";
}

function validateCommandContract(command: DestructionHttpCommand) {
  const { metadata } = command;
  requireCompetition(Number.isSafeInteger(metadata.expectedRevision) && metadata.expectedRevision >= 0, "INVALID_COMMAND_CONTRACT", "A non-negative expected revision is required.");
  requireCompetition(metadata.idempotency.keyHash instanceof Uint8Array && metadata.idempotency.keyHash.byteLength === 32, "INVALID_COMMAND_CONTRACT", "The idempotency key digest is invalid.");
  requireCompetition(metadata.idempotency.requestFingerprint instanceof Uint8Array && metadata.idempotency.requestFingerprint.byteLength === 32 && sameDigest(metadata.idempotency.requestFingerprint, destructionCommandRequestFingerprint(command)), "INVALID_COMMAND_CONTRACT", "The request fingerprint is invalid.");
  requireCompetition(metadata.idempotency.scope === expectedScope(command), "INVALID_COMMAND_CONTRACT", "The command scope is invalid.");
  const intent = metadata.authorizationIntent;
  if (intent.kind === "ADMIN_TOTP") {
    const minimumRole = destructionAdminMinimumRole(command.type as DestructionAdminCommandType);
    requireCompetition(intent.minimumRole === minimumRole && intent.requireTotp === true && intent.transactionRecheck === true, "INVALID_COMMAND_CONTRACT", "The administrator authorization contract is invalid.");
    requireCompetition(metadata.actor.role === "SUPER_ADMIN" || (metadata.actor.role === "ADMIN" && minimumRole === "ADMIN"), "INVALID_COMMAND_CONTRACT", "The actor role does not satisfy the command contract.");
  } else {
    requireCompetition(intent.requireApprovedAccount === true && intent.requireOwnership === true && intent.transactionRecheck === true && intent.ownerUserAccountId === metadata.actor.userAccountId, "INVALID_COMMAND_CONTRACT", "The owner authorization contract is invalid.");
  }
}

export class DestructionCommandHandler {
  constructor(private readonly dependencies: DestructionCommandHandlerDependencies) {}

  handle(command: DestructionHttpCommand): Promise<DestructionMutationResult> {
    return this.dependencies.unitOfWork.transaction(async (transaction) => {
      validateCommandContract(command);
      await this.dependencies.authorization.recheck(transaction, command);
      const claim = await this.dependencies.receipts.claim(transaction, command);
      requireCompetition(claim.kind !== "MISMATCH", "INVALID_COMMAND_CONTRACT", "An idempotency key cannot be reused for another request.");
      if (claim.kind === "REPLAY") return { body: claim.receipt.body, revision: claim.receipt.revision!, replayed: true };
      const current = await this.dependencies.repository.loadForUpdate(transaction, command.tournamentId);
      const create = command.type === "CREATE_DESTRUCTION";
      requireCompetition(create ? current === null && command.metadata.expectedRevision === 0 : current?.revision === command.metadata.expectedRevision, "PRECONDITION_FAILED", "The destruction revision changed.");
      const galleryId = command.type === "SET_MEDIA_GALLERY" || command.type === "COMPLETE_DESTRUCTION"
        ? command.payload.galleryId
        : undefined;
      if (galleryId) await this.dependencies.repository.assertPublishedReadyGallery(transaction, galleryId);
      const now = this.dependencies.clock.now();
      const aggregate = Object.freeze({ ...applyCommand(current, command, now), revision: command.metadata.expectedRevision + 1 });
      const body: DestructionHttpMutationBody = { tournamentId: aggregate.id, revision: aggregate.revision, status: aggregate.lifecycle.status, commandType: command.type };
      const receipt: CompetitionCommandReceipt<DestructionHttpMutationBody> = { actorUserAccountId: command.metadata.actor.userAccountId, scope: command.metadata.idempotency.scope, keyHash: command.metadata.idempotency.keyHash, requestHash: command.metadata.idempotency.requestFingerprint, responseStatus: create ? 201 : 200, body, revision: aggregate.revision, createdAt: now, expiresAt: this.dependencies.clock.receiptExpiresAt(now) };
      const audit: CompetitionAuditEvent = { requestId: command.metadata.requestId, actorUserAccountId: command.metadata.actor.userAccountId, action: `DESTRUCTION_${command.type}`, targetType: "DESTRUCTION", targetId: aggregate.id, before: current ? stateJson(current) : null, after: stateJson(aggregate), metadata: { scope: command.metadata.idempotency.scope }, occurredAt: now };
      const outbox: CompetitionOutboxEvent = { id: command.metadata.requestId, requestId: command.metadata.requestId, aggregateType: "DESTRUCTION", aggregateId: aggregate.id, aggregateRevision: aggregate.revision, eventType: `DESTRUCTION_${command.type}`, dedupeKey: `${aggregate.id}:${aggregate.revision}`, payload: body, status: "PENDING", attemptCount: 0, occurredAt: now, deliveredAt: null };
      validateCompetitionCommandReceipt(receipt);
      validateCompetitionAuditEvent(audit);
      validateCompetitionOutboxEvent(outbox);
      await this.dependencies.repository.save(transaction, { aggregate, expectedRevision: command.metadata.expectedRevision, create });
      await this.dependencies.audit.append(transaction, audit);
      await this.dependencies.outbox.append(transaction, outbox);
      await this.dependencies.receipts.complete(transaction, receipt);
      return { body, revision: aggregate.revision, replayed: false };
    });
  }
}

type DestructionAdminCommandType = Extract<DestructionHttpCommand, { metadata: { authorizationIntent: { kind: "ADMIN_TOTP" } } }>["type"];
