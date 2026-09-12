import type { QueryResultRow } from "pg";

import {
  advanceSingleEliminationBracket,
  buildSingleEliminationBracket,
  recalculateStandings,
  validateBestOfResult,
  validateCompetitionRoster,
  type BracketFixture,
  type CompetitionPosition,
  type StandingsFixture,
} from "../../src/modules/competitions/core";
import type { EventAggregate, EventParticipant, EventTeam } from "../../src/modules/competitions/events";
import {
  validateConfirmedDestructionRosters,
  validateDestructionConfiguration,
  type DestructionAggregate,
  type DestructionApplication,
  type DestructionFixtureRosterSnapshot,
  type DestructionMvpBallot,
  type DestructionParticipant,
  type DestructionReplacement,
  type DestructionTeam,
} from "../../src/modules/competitions/destruction";
import type { CutoverClient, CutoverStepResult } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;
const POSITIONS = ["TOP", "JGL", "MID", "ADC", "SUP"] as const;
const EVENT_STATUSES = ["PLANNED", "RECRUITING", "TEAM_BUILDING", "IN_PROGRESS", "COMPLETED"] as const;
const DESTRUCTION_STATUSES = ["PLANNED", "RECRUITING", "TEAM_BUILDING", "AUCTION", "PRELIMINARY", "TOURNAMENT", "COMPLETED"] as const;
const APPLICATION_STATUSES = ["APPLIED", "CONFIRMED", "RESERVE", "REJECTED", "CANCELLED"] as const;
const AUCTION_STATUSES = ["PENDING", "DRAWN", "SOLD", "HOLD", "ASSIGNED"] as const;

type EventStatus = (typeof EVENT_STATUSES)[number];
type DestructionStatus = (typeof DESTRUCTION_STATUSES)[number];
type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

type LegacyEventTeam = Readonly<{
  legacyId: number;
  id: string;
  name: string;
  seed: number | null;
  score: number;
}>;

type LegacyEventParticipant = Readonly<{
  legacyId: number;
  id: string;
  playerId: string;
  ownerUserAccountId: string | null;
  teamId: string | null;
  position: string | null;
  balanceScore: number;
}>;

type LegacyEventApplication = Readonly<{
  legacyId: number;
  id: string;
  playerId: string;
  ownerUserAccountId: string | null;
  mainPosition: string | null;
  subPositions: readonly string[];
  status: string;
}>;

type LegacyEventFixture = Readonly<{
  legacyId: number;
  id: string;
  stage: BracketFixture["stage"];
  round: number;
  teamAId: string;
  teamBId: string;
  winnerTeamId: string | null;
  mvpPlayerId: string | null;
}>;

export type LegacyEventCompetition = Readonly<{
  legacyId: number;
  id: string;
  title: string;
  description: string | null;
  status: string;
  mode: string;
  eventDate: string;
  recruitFrom: string | null;
  recruitTo: string | null;
  winnerTeamId: string | null;
  mvpPlayerId: string | null;
  galleryImageId: number | null;
  createdAt: string;
  updatedAt: string;
  teams: readonly LegacyEventTeam[];
  participants: readonly LegacyEventParticipant[];
  applications: readonly LegacyEventApplication[];
  fixtures: readonly LegacyEventFixture[];
}>;

type LegacyDestructionApplication = Readonly<{
  legacyId: number;
  id: string;
  playerId: string;
  ownerUserAccountId: string | null;
  position: string;
  subPositions: readonly string[];
  status: string;
}>;

type LegacyDestructionParticipant = Readonly<{
  legacyId: number;
  id: string;
  playerId: string;
  teamId: string | null;
  position: string;
  isCaptain: boolean;
  auctionStatus: string;
  purchasePoints: number | null;
  drawOrder: number | null;
}>;

type LegacyDestructionTeam = Readonly<{
  legacyId: number;
  id: string;
  name: string;
  captainPlayerId: string;
  initialAuctionPoints: number;
  remainingAuctionPoints: number;
  points: number;
  wins: number;
  losses: number;
}>;

type LegacyDestructionVote = Readonly<{
  voterPlayerId: string;
  candidatePlayerId: string;
}>;

type LegacyDestructionFixture = Readonly<{
  legacyId: number;
  id: string;
  stage: "PRELIMINARY" | "SEMI_FINAL" | "FINAL";
  round: number;
  groupKey: string | null;
  teamAId: string;
  teamBId: string;
  winnerTeamId: string | null;
  mvpPlayerId: string | null;
  mvpSelectionMethod: "VOTE" | "ADMIN" | null;
  mvpFinalizedAt: string | null;
  mvpVoteRound: number;
  mvpRevoteCandidatePlayerIds: readonly string[];
  isReplay: boolean;
  isConfirmed: boolean;
  matchDate: string | null;
  bestOf: number;
  teamAScore: number;
  teamBScore: number;
  updatedAt: string;
  votes: readonly LegacyDestructionVote[];
}>;

type LegacyDestructionReplacement = Readonly<{
  legacyId: number;
  id: string;
  participantId: string;
  teamId: string;
  outgoingPlayerId: string;
  incomingPlayerId: string;
  outgoingPosition: string;
  incomingPosition: string;
  reason: string;
  effectiveAt: string;
}>;

export type LegacyDestructionCompetition = Readonly<{
  legacyId: number;
  id: string;
  title: string;
  description: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  preliminaryFormat: string;
  preliminaryBestOf: number;
  preliminaryRoundCount: number;
  advanceTeamCount: number;
  laneLimits: Readonly<Record<CompetitionPosition, number>>;
  winnerTeamId: string | null;
  mvpPlayerId: string | null;
  galleryImageId: number | null;
  createdAt: string;
  updatedAt: string;
  applications: readonly LegacyDestructionApplication[];
  participants: readonly LegacyDestructionParticipant[];
  teams: readonly LegacyDestructionTeam[];
  fixtures: readonly LegacyDestructionFixture[];
  replacements: readonly LegacyDestructionReplacement[];
}>;

export type ImportV1CompetitionsOptions = Readonly<{ actorUserAccountId: string }>;

function fail(message: string): never {
  throw new Error(`V1 competition import rejected: ${message}`);
}

function requireValue<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) fail(message);
  return value;
}

function uuid(value: string, label: string) {
  if (!UUID.test(value)) fail(`${label} is not a UUID.`);
  return value.toLocaleLowerCase("en-US");
}

function safeInteger(value: number, label: string, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) fail(`${label} is outside its safe integer range.`);
  return value;
}

function finite(value: number, label: string) {
  if (!Number.isFinite(value)) fail(`${label} is not finite.`);
  return value;
}

function text(value: string, label: string, maximum: number, minimum = 1) {
  const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (normalized.length < minimum || normalized.length > maximum || UNSAFE_TEXT.test(value)) fail(`${label} is invalid.`);
  return normalized;
}

function optionalText(value: string | null, label: string, maximum: number) {
  if (value === null || value.trim() === "") return null;
  return text(value, label, maximum);
}

function instant(value: string, label: string) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) fail(`${label} is not a timestamp.`);
  return new Date(time).toISOString();
}

function position(value: string, label: string): CompetitionPosition {
  if (!POSITIONS.includes(value as CompetitionPosition)) fail(`${label} is not a supported position.`);
  return value as CompetitionPosition;
}

function uniqueBy<T>(values: readonly T[], key: (value: T) => string, label: string) {
  const seen = new Set<string>();
  for (const value of values) {
    const candidate = key(value);
    if (seen.has(candidate)) fail(`${label} contains duplicate ${candidate}.`);
    seen.add(candidate);
  }
}

function eventLifecycle(status: string): EventAggregate["lifecycle"] {
  if (status === "CANCELLED") fail("cancelled events lack a recoverable prior state and cancellation reason in V1.");
  if (!EVENT_STATUSES.includes(status as EventStatus)) fail(`event status ${status} is unsupported.`);
  return { status: status as EventStatus, cancelledFrom: null, cancellationReason: null };
}

function destructionLifecycle(status: string): DestructionAggregate["lifecycle"] {
  if (status === "CANCELLED") fail("cancelled destruction competitions lack a recoverable prior state and cancellation reason in V1.");
  if (!DESTRUCTION_STATUSES.includes(status as DestructionStatus)) fail(`destruction status ${status} is unsupported.`);
  return { status: status as DestructionStatus, cancelledFrom: null, cancellationReason: null };
}

function eventPreference(
  format: "POSITION" | "ARAM",
  mainPosition: string | null,
  subPositions: readonly string[],
  label: string,
) {
  if (format === "ARAM") {
    return { mainPosition: null, subPositions: Object.freeze([]) } as const;
  }
  const main = position(requireValue(mainPosition, `${label} has no main position.`), `${label}.mainPosition`);
  const subs = [...new Set(subPositions.filter((entry) => entry !== main && entry !== "ALL"))]
    .map((entry, index) => position(entry, `${label}.subPositions[${index}]`));
  return { mainPosition: main, subPositions: Object.freeze(subs) };
}

function applyEventResults(
  eventId: string,
  teams: readonly EventTeam[],
  fixtures: readonly LegacyEventFixture[],
) {
  if (fixtures.length === 0) return null;
  if (teams.length < 2) fail(`event ${eventId} has fixtures without two teams.`);
  if (teams.some((team) => team.seed === null)) fail(`event ${eventId} has a bracket but incomplete team seeds.`);
  let bracket = buildSingleEliminationBracket({
    competitionId: eventId,
    teams: teams.map((team) => ({ id: team.id, seed: team.seed! })),
    bestOf: 1,
  });
  const ordered = [...fixtures].sort((left, right) => {
    const stages = ["ROUND_OF_32", "ROUND_OF_16", "QUARTER_FINAL", "SEMI_FINAL", "FINAL"];
    return stages.indexOf(left.stage) - stages.indexOf(right.stage) || left.round - right.round;
  });
  uniqueBy(ordered, (fixture) => `${fixture.stage}:${fixture.round}`, `event ${eventId} fixtures`);
  for (const source of ordered) {
    const target = bracket.fixtures.find((fixture) => fixture.stage === source.stage && fixture.slotNumber === source.round);
    if (!target || target.teamAId !== source.teamAId || target.teamBId !== source.teamBId) {
      fail(`event ${eventId} fixture ${source.legacyId} cannot be reconciled with the deterministic seeded bracket.`);
    }
    if (source.winnerTeamId === null) {
      if (source.mvpPlayerId !== null) fail(`event ${eventId} pending fixture ${source.legacyId} has an MVP.`);
      continue;
    }
    bracket = advanceSingleEliminationBracket(bracket, {
      fixtureId: target.id,
      teamAScore: source.winnerTeamId === source.teamAId ? 1 : 0,
      teamBScore: source.winnerTeamId === source.teamBId ? 1 : 0,
      winnerTeamId: source.winnerTeamId,
    }).bracket;
  }
  return bracket;
}

export function buildImportedEventAggregate(source: LegacyEventCompetition): EventAggregate {
  const id = uuid(source.id, `event ${source.legacyId}`);
  const format = source.mode === "POSITION" || source.mode === "ARAM" ? source.mode : fail(`event ${source.legacyId} mode is unsupported.`);
  const createdAt = instant(source.createdAt, `event ${source.legacyId}.createdAt`);
  const updatedAt = instant(source.updatedAt, `event ${source.legacyId}.updatedAt`);
  instant(source.eventDate, `event ${source.legacyId}.eventDate`);
  const recruitmentOpensAt = instant(requireValue(source.recruitFrom, `event ${source.legacyId} has no recruitment opening.`), `event ${source.legacyId}.recruitFrom`);
  const recruitmentClosesAt = instant(requireValue(source.recruitTo, `event ${source.legacyId} has no recruitment closing.`), `event ${source.legacyId}.recruitTo`);
  if (Date.parse(recruitmentClosesAt) <= Date.parse(recruitmentOpensAt)) fail(`event ${source.legacyId} recruitment window is invalid.`);
  uniqueBy(source.teams, (team) => team.id, `event ${source.legacyId} teams`);
  uniqueBy(source.participants, (participant) => participant.id, `event ${source.legacyId} participants`);
  uniqueBy(source.participants, (participant) => participant.playerId, `event ${source.legacyId} participant players`);
  uniqueBy(source.applications, (application) => application.playerId, `event ${source.legacyId} applications`);

  const applicationByPlayer = new Map(source.applications.map((application) => [application.playerId, application]));
  const actualPlayerIds = new Set(source.participants.map((participant) => participant.playerId));
  const participants: EventParticipant[] = source.participants.map((entry) => {
    const application = applicationByPlayer.get(entry.playerId);
    if (application && !["APPLIED", "CONFIRMED"].includes(application.status)) {
      fail(`event ${source.legacyId} participant ${entry.legacyId} conflicts with application status ${application.status}.`);
    }
    if (application && application.ownerUserAccountId === null) fail(`event ${source.legacyId} application ${application.legacyId} has no mapped owner.`);
    const applicationMainPosition = application?.mainPosition === "ALL" ? entry.position : application?.mainPosition;
    const preference = eventPreference(format, applicationMainPosition ?? entry.position, application?.subPositions ?? [], `event participant ${entry.legacyId}`);
    if (format === "POSITION" && entry.position !== null && preference.mainPosition !== entry.position) {
      fail(`event ${source.legacyId} participant ${entry.legacyId} position differs from its application.`);
    }
    return {
      id: uuid(entry.id, `event participant ${entry.legacyId}`),
      playerId: uuid(entry.playerId, `event participant ${entry.legacyId}.playerId`),
      ownerUserAccountId: application ? uuid(application.ownerUserAccountId!, `event application ${application.legacyId}.owner`) : entry.ownerUserAccountId,
      source: application ? "USER_APPLICATION" : "ADMIN_IMPORT",
      status: "ACTIVE",
      ...preference,
    };
  });
  for (const application of source.applications.filter((entry) => !actualPlayerIds.has(entry.playerId))) {
    if (!APPLICATION_STATUSES.includes(application.status as ApplicationStatus)) fail(`event application ${application.legacyId} status is unsupported.`);
    if (application.status === "RESERVE" || application.status === "REJECTED") {
      fail(`event application ${application.legacyId} status ${application.status} has no lossless V2 event status.`);
    }
    const ownerUserAccountId = uuid(requireValue(application.ownerUserAccountId, `event application ${application.legacyId} has no mapped owner.`), `event application ${application.legacyId}.owner`);
    participants.push({
      id: uuid(application.id, `event application ${application.legacyId}`),
      playerId: uuid(application.playerId, `event application ${application.legacyId}.playerId`),
      ownerUserAccountId,
      source: "USER_APPLICATION",
      status: application.status === "CANCELLED" ? "CANCELLED" : "ACTIVE",
      ...eventPreference(format, application.mainPosition, application.subPositions, `event application ${application.legacyId}`),
    });
  }
  uniqueBy(participants, (participant) => participant.id, `event ${source.legacyId} imported participants`);
  uniqueBy(participants, (participant) => participant.playerId, `event ${source.legacyId} imported participant players`);
  const activeParticipantCount = participants.filter((participant) => participant.status === "ACTIVE").length;
  if (activeParticipantCount > 10) fail(`event ${source.legacyId} has more than ten active participants.`);

  const participantById = new Map(participants.map((participant) => [participant.id, participant]));
  const teams: EventTeam[] = source.teams.map((team) => {
    const members = source.participants.filter((participant) => participant.teamId === team.id).map((participant) => ({
      participantId: participant.id,
      position: format === "POSITION" ? position(requireValue(participant.position, `event participant ${participant.legacyId} has no team position.`), `event participant ${participant.legacyId}.position`) : null,
    }));
    const completeLegacyRoster = members.length === 5
      && (format === "ARAM" || new Set(members.map((member) => member.position)).size === 5);
    if (completeLegacyRoster) {
      validateCompetitionRoster({
        format: format === "POSITION" ? "POSITIONAL" : "ARAM",
        members: members.map((member) => ({
          participantId: member.participantId,
          playerId: requireValue(participantById.get(member.participantId), `event member ${member.participantId} is missing.`).playerId,
          position: member.position,
        })),
      });
    }
    return {
      id: uuid(team.id, `event team ${team.legacyId}`),
      name: text(team.name, `event team ${team.legacyId}.name`, 50),
      seed: team.seed === null ? null : safeInteger(team.seed, `event team ${team.legacyId}.seed`, 1, 32),
      balanceScore: finite(team.score, `event team ${team.legacyId}.score`),
      members: Object.freeze(members),
    };
  });
  if (source.participants.some((participant) => participant.teamId !== null && !teams.some((team) => team.id === participant.teamId))) {
    fail(`event ${source.legacyId} has a participant referencing an unknown team.`);
  }
  const bracket = applyEventResults(id, teams, source.fixtures);
  const lifecycle = eventLifecycle(source.status);
  if ((lifecycle.status === "PLANNED" || lifecycle.status === "RECRUITING") && (teams.length > 0 || bracket !== null)) fail(`event ${source.legacyId} has premature teams or bracket state.`);
  if (lifecycle.status === "TEAM_BUILDING" && bracket !== null) fail(`event ${source.legacyId} has a bracket while team building.`);
  if ((lifecycle.status === "IN_PROGRESS" || lifecycle.status === "COMPLETED") && bracket === null) fail(`event ${source.legacyId} has no bracket for status ${lifecycle.status}.`);
  const winnerTeamId = source.winnerTeamId === null ? null : uuid(source.winnerTeamId, `event ${source.legacyId}.winnerTeamId`);
  if (winnerTeamId !== (bracket?.championTeamId ?? null)) fail(`event ${source.legacyId} winner disagrees with its bracket.`);
  const mvpParticipantId = source.mvpPlayerId === null
    ? null
    : requireValue(participants.find((participant) => participant.playerId === source.mvpPlayerId)?.id, `event ${source.legacyId} MVP is not an imported participant.`);
  const nonFinalMvp = source.fixtures.find((fixture) => fixture.mvpPlayerId !== null && fixture.stage !== "FINAL");
  if (nonFinalMvp) fail(`event fixture ${nonFinalMvp.legacyId} has a per-match MVP that V2 events cannot represent.`);
  const finalMvp = source.fixtures.find((fixture) => fixture.stage === "FINAL")?.mvpPlayerId ?? null;
  if (finalMvp !== source.mvpPlayerId) fail(`event ${source.legacyId} MVP disagrees with the final fixture.`);
  if (lifecycle.status === "COMPLETED" && (!winnerTeamId || !mvpParticipantId)) fail(`completed event ${source.legacyId} lacks a winner or MVP.`);

  return Object.freeze({
    id,
    galleryId: null,
    settings: Object.freeze({
      title: text(source.title, `event ${source.legacyId}.title`, 120),
      description: optionalText(source.description, `event ${source.legacyId}.description`, 2_000),
      format,
      recruitmentOpensAt,
      recruitmentClosesAt,
      bracketBestOf: 1,
    }),
    lifecycle,
    participants: Object.freeze(participants),
    teams: Object.freeze(teams),
    bracket,
    winnerTeamId,
    mvpParticipantId,
    revision: 1,
    createdAt,
    updatedAt,
  });
}

function standingsFixture(source: LegacyDestructionFixture): StandingsFixture {
  if (source.isReplay) fail(`destruction fixture ${source.legacyId} is a replay, which V2 cannot represent losslessly.`);
  const bestOf = safeInteger(source.bestOf, `destruction fixture ${source.legacyId}.bestOf`, 1, 9);
  if (bestOf % 2 === 0) fail(`destruction fixture ${source.legacyId} has an even best-of value.`);
  if (source.winnerTeamId === null) {
    if (source.teamAScore !== 0 || source.teamBScore !== 0 || source.isConfirmed) fail(`pending destruction fixture ${source.legacyId} carries result state.`);
    return { id: source.id, groupKey: source.groupKey, status: "PENDING", confirmed: false, bestOf, teamAId: source.teamAId, teamBId: source.teamBId, teamAScore: null, teamBScore: null, winnerTeamId: null };
  }
  const result = validateBestOfResult({ bestOf, teamAId: source.teamAId, teamBId: source.teamBId, teamAScore: source.teamAScore, teamBScore: source.teamBScore, winnerTeamId: source.winnerTeamId });
  return { id: source.id, groupKey: source.groupKey, status: "COMPLETED", confirmed: source.isConfirmed, ...result };
}

function buildDestructionTournamentBracket(
  source: LegacyDestructionCompetition,
  fixtures: readonly LegacyDestructionFixture[],
) {
  if (fixtures.length === 0) return { bracket: null, qualifiedTeamIds: Object.freeze([]), fixtureIdByLegacyId: new Map<number, string>() };
  const semis = fixtures.filter((fixture) => fixture.stage === "SEMI_FINAL").sort((left, right) => left.round - right.round);
  const finals = fixtures.filter((fixture) => fixture.stage === "FINAL").sort((left, right) => left.round - right.round);
  if (semis.length !== 2 || semis[0]?.round !== 1 || semis[1]?.round !== 2 || finals.length > 1 || (finals[0] && finals[0].round !== 1)) {
    fail(`destruction ${source.legacyId} tournament bracket does not contain the canonical two semifinals and optional final.`);
  }
  const seeded = [semis[0]!.teamAId, semis[1]!.teamAId, semis[1]!.teamBId, semis[0]!.teamBId];
  if (new Set(seeded).size !== 4) fail(`destruction ${source.legacyId} tournament bracket does not contain four unique qualified teams.`);
  let bracket = buildSingleEliminationBracket({ competitionId: source.id, teams: seeded.map((id, index) => ({ id, seed: index + 1 })), bestOf: 3 });
  const fixtureIdByLegacyId = new Map<number, string>();
  for (const legacy of [...semis, ...finals]) {
    if (legacy.bestOf !== 3) fail(`destruction tournament fixture ${legacy.legacyId} is not BO3.`);
    const target = bracket.fixtures.find((fixture) => fixture.stage === legacy.stage && fixture.slotNumber === legacy.round);
    if (!target || target.teamAId !== legacy.teamAId || target.teamBId !== legacy.teamBId) fail(`destruction tournament fixture ${legacy.legacyId} disagrees with the seeded bracket.`);
    fixtureIdByLegacyId.set(legacy.legacyId, target.id);
    if (legacy.winnerTeamId !== null) {
      bracket = advanceSingleEliminationBracket(bracket, {
        fixtureId: target.id,
        teamAScore: legacy.teamAScore,
        teamBScore: legacy.teamBScore,
        winnerTeamId: legacy.winnerTeamId,
      }).bracket;
    } else if (legacy.teamAScore !== 0 || legacy.teamBScore !== 0 || legacy.isConfirmed) {
      fail(`pending destruction tournament fixture ${legacy.legacyId} carries result state.`);
    }
  }
  return { bracket, qualifiedTeamIds: Object.freeze(seeded), fixtureIdByLegacyId };
}

function ballotAndSnapshot(
  fixture: LegacyDestructionFixture,
  fixtureId: string,
  participants: readonly DestructionParticipant[],
): { ballot: DestructionMvpBallot | null; snapshot: DestructionFixtureRosterSnapshot | null } {
  const hasMvpState = fixture.mvpPlayerId !== null || fixture.votes.length > 0 || fixture.mvpVoteRound > 1 || fixture.mvpRevoteCandidatePlayerIds.length > 0;
  if (!hasMvpState) return { ballot: null, snapshot: null };
  const teamA = participants.filter((participant) => participant.teamId === fixture.teamAId);
  const teamB = participants.filter((participant) => participant.teamId === fixture.teamBId);
  if (teamA.length !== 5 || teamB.length !== 5) fail(`destruction fixture ${fixture.legacyId} MVP state lacks a ten-player current roster.`);
  const participantPlayerIds = [...teamA, ...teamB].map((participant) => participant.playerId).sort();
  const candidates = fixture.mvpRevoteCandidatePlayerIds.length > 0 ? [...fixture.mvpRevoteCandidatePlayerIds].sort() : [...participantPlayerIds];
  if (new Set(candidates).size !== candidates.length || candidates.some((id) => !participantPlayerIds.includes(id))) fail(`destruction fixture ${fixture.legacyId} has invalid MVP candidates.`);
  uniqueBy(fixture.votes, (vote) => vote.voterPlayerId, `destruction fixture ${fixture.legacyId} votes`);
  for (const vote of fixture.votes) {
    if (!participantPlayerIds.includes(vote.voterPlayerId) || !candidates.includes(vote.candidatePlayerId) || vote.voterPlayerId === vote.candidatePlayerId) fail(`destruction fixture ${fixture.legacyId} has an invalid MVP vote.`);
  }
  const finalizedAt = fixture.mvpFinalizedAt === null ? null : instant(fixture.mvpFinalizedAt, `destruction fixture ${fixture.legacyId}.mvpFinalizedAt`);
  if ((fixture.mvpPlayerId === null) !== (fixture.mvpSelectionMethod === null || finalizedAt === null)) fail(`destruction fixture ${fixture.legacyId} has inconsistent finalized MVP state.`);
  if (fixture.mvpPlayerId !== null && !participantPlayerIds.includes(fixture.mvpPlayerId)) fail(`destruction fixture ${fixture.legacyId} MVP is outside the roster.`);
  const capturedAt = finalizedAt ?? instant(fixture.updatedAt, `destruction fixture ${fixture.legacyId}.updatedAt`);
  const member = (participant: DestructionParticipant) => ({ participantId: participant.id, playerId: participant.playerId, position: participant.position, isCaptain: participant.isCaptain });
  return {
    snapshot: { fixtureId, capturedAt, teamAId: fixture.teamAId, teamBId: fixture.teamBId, teamA: Object.freeze(teamA.map(member)), teamB: Object.freeze(teamB.map(member)) },
    ballot: {
      fixtureId,
      participantPlayerIds: Object.freeze(participantPlayerIds),
      round: safeInteger(fixture.mvpVoteRound, `destruction fixture ${fixture.legacyId}.mvpVoteRound`, 1),
      candidatePlayerIds: Object.freeze(candidates),
      votes: Object.freeze(fixture.votes.map((vote) => Object.freeze({ ...vote }))),
      finalizedPlayerId: fixture.mvpPlayerId,
      selectionMethod: fixture.mvpSelectionMethod,
      finalizedAt,
    },
  };
}

export function buildImportedDestructionAggregate(source: LegacyDestructionCompetition): DestructionAggregate {
  const id = uuid(source.id, `destruction ${source.legacyId}`);
  const createdAt = instant(source.createdAt, `destruction ${source.legacyId}.createdAt`);
  const updatedAt = instant(source.updatedAt, `destruction ${source.legacyId}.updatedAt`);
  if (source.startDate !== null) instant(source.startDate, `destruction ${source.legacyId}.startDate`);
  if (source.endDate !== null) instant(source.endDate, `destruction ${source.legacyId}.endDate`);
  if (source.advanceTeamCount !== 4) fail(`destruction ${source.legacyId} advanceTeamCount is not supported by the V2 four-team bracket.`);
  const teamCount = source.teams.length;
  if (teamCount < 4) fail(`destruction ${source.legacyId} has no explicit V1 team count and fewer than four materialized teams.`);
  const configuration = validateDestructionConfiguration({ preliminaryFormat: source.preliminaryFormat, preliminaryRoundCount: source.preliminaryRoundCount, teamCount, laneLimits: source.laneLimits });
  if (source.preliminaryBestOf !== configuration.preliminaryBestOf) fail(`destruction ${source.legacyId} preliminary best-of disagrees with its format.`);
  uniqueBy(source.applications, (application) => application.id, `destruction ${source.legacyId} applications`);
  uniqueBy(source.applications, (application) => application.playerId, `destruction ${source.legacyId} application players`);
  const applications: DestructionApplication[] = source.applications.map((application) => {
    if (!APPLICATION_STATUSES.includes(application.status as ApplicationStatus)) fail(`destruction application ${application.legacyId} status is unsupported.`);
    return {
      id: uuid(application.id, `destruction application ${application.legacyId}`),
      userAccountId: uuid(requireValue(application.ownerUserAccountId, `destruction application ${application.legacyId} has no mapped owner.`), `destruction application ${application.legacyId}.owner`),
      playerId: uuid(application.playerId, `destruction application ${application.legacyId}.playerId`),
      position: position(application.position, `destruction application ${application.legacyId}.position`),
      status: application.status as ApplicationStatus,
    };
  });
  uniqueBy(source.participants, (participant) => participant.id, `destruction ${source.legacyId} participants`);
  uniqueBy(source.participants, (participant) => participant.playerId, `destruction ${source.legacyId} participant players`);
  const participants: DestructionParticipant[] = source.participants.map((participant) => {
    if (!AUCTION_STATUSES.includes(participant.auctionStatus as (typeof AUCTION_STATUSES)[number])) fail(`destruction participant ${participant.legacyId} auction status is unsupported.`);
    const teamId = participant.teamId === null ? null : uuid(participant.teamId, `destruction participant ${participant.legacyId}.teamId`);
    if ((participant.auctionStatus === "SOLD" || participant.auctionStatus === "ASSIGNED") && (teamId === null || participant.purchasePoints === null)) fail(`destruction participant ${participant.legacyId} has incomplete assignment state.`);
    return {
      id: uuid(participant.id, `destruction participant ${participant.legacyId}`),
      playerId: uuid(participant.playerId, `destruction participant ${participant.legacyId}.playerId`),
      position: position(participant.position, `destruction participant ${participant.legacyId}.position`),
      isCaptain: participant.isCaptain,
      teamId,
      auctionStatus: participant.auctionStatus as DestructionParticipant["auctionStatus"],
      purchasePoints: participant.purchasePoints === null ? null : safeInteger(participant.purchasePoints, `destruction participant ${participant.legacyId}.purchasePoints`, 0, 1_000_000),
      drawOrder: participant.drawOrder === null ? null : safeInteger(participant.drawOrder, `destruction participant ${participant.legacyId}.drawOrder`, 1),
    };
  });
  uniqueBy(source.teams, (team) => team.id, `destruction ${source.legacyId} teams`);
  const teams: DestructionTeam[] = source.teams.map((team) => {
    const captain = participants.find((participant) => participant.playerId === team.captainPlayerId && participant.teamId === team.id);
    if (!captain?.isCaptain) fail(`destruction team ${team.legacyId} captain is not its assigned captain participant.`);
    return {
      id: uuid(team.id, `destruction team ${team.legacyId}`),
      name: text(team.name, `destruction team ${team.legacyId}.name`, 50),
      captainParticipantId: captain.id,
      initialAuctionPoints: safeInteger(team.initialAuctionPoints, `destruction team ${team.legacyId}.initialAuctionPoints`, 0, 1_000_000),
      remainingAuctionPoints: safeInteger(team.remainingAuctionPoints, `destruction team ${team.legacyId}.remainingAuctionPoints`, 0, team.initialAuctionPoints),
      confirmed: true,
    };
  });
  if (participants.some((participant) => participant.teamId !== null && !teams.some((team) => team.id === participant.teamId))) fail(`destruction ${source.legacyId} has a participant referencing an unknown team.`);
  if (participants.length > configuration.teamCount * configuration.rosterSize) fail(`destruction ${source.legacyId} participant count exceeds configured capacity.`);
  if (participants.length === configuration.teamCount * configuration.rosterSize) validateConfirmedDestructionRosters(teams, participants);
  const lifecycle = destructionLifecycle(source.status);
  if (["AUCTION", "PRELIMINARY", "TOURNAMENT", "COMPLETED"].includes(lifecycle.status) && participants.length !== configuration.teamCount * configuration.rosterSize) fail(`destruction ${source.legacyId} status ${lifecycle.status} lacks full rosters.`);
  const auctionIncomplete = participants.some((participant) => participant.auctionStatus !== "SOLD" && participant.auctionStatus !== "ASSIGNED");
  if (lifecycle.status === "AUCTION" && auctionIncomplete) fail(`destruction ${source.legacyId} has an in-flight V1 auction but no reproducible auction seed.`);

  const preliminarySources = source.fixtures.filter((fixture) => fixture.stage === "PRELIMINARY");
  const preliminaryFixtures = Object.freeze(preliminarySources.map((fixture) => standingsFixture(fixture)));
  const standings = preliminaryFixtures.length > 0
    ? recalculateStandings({ teamIds: teams.map((team) => team.id), fixtures: preliminaryFixtures })
    : [];
  for (const sourceTeam of source.teams) {
    const projected = standings.find((standing) => standing.teamId === sourceTeam.id);
    if (projected) {
      if (sourceTeam.points !== projected.points || sourceTeam.wins !== projected.wins || sourceTeam.losses !== projected.losses) fail(`destruction team ${sourceTeam.legacyId} standings disagree with its confirmed fixtures.`);
    } else if (sourceTeam.points !== 0 || sourceTeam.wins !== 0 || sourceTeam.losses !== 0) {
      fail(`destruction team ${sourceTeam.legacyId} has standings without preliminary fixtures.`);
    }
  }
  const tournamentSources = source.fixtures.filter((fixture) => fixture.stage !== "PRELIMINARY");
  const tournament = buildDestructionTournamentBracket(source, tournamentSources);
  if ((lifecycle.status === "PRELIMINARY" || lifecycle.status === "TOURNAMENT" || lifecycle.status === "COMPLETED") && preliminaryFixtures.length === 0) fail(`destruction ${source.legacyId} has no preliminary fixtures for status ${lifecycle.status}.`);
  if ((lifecycle.status === "TOURNAMENT" || lifecycle.status === "COMPLETED") && tournament.bracket === null) fail(`destruction ${source.legacyId} has no tournament bracket for status ${lifecycle.status}.`);
  const canImportMvpHistory = source.replacements.length === 0;

  const replacements: DestructionReplacement[] = source.replacements.map((replacement) => ({
    id: uuid(replacement.id, `destruction replacement ${replacement.legacyId}`),
    participantId: uuid(replacement.participantId, `destruction replacement ${replacement.legacyId}.participantId`),
    teamId: uuid(replacement.teamId, `destruction replacement ${replacement.legacyId}.teamId`),
    outgoingPlayerId: uuid(replacement.outgoingPlayerId, `destruction replacement ${replacement.legacyId}.outgoingPlayerId`),
    incomingPlayerId: uuid(replacement.incomingPlayerId, `destruction replacement ${replacement.legacyId}.incomingPlayerId`),
    outgoingPosition: position(replacement.outgoingPosition, `destruction replacement ${replacement.legacyId}.outgoingPosition`),
    incomingPosition: position(replacement.incomingPosition, `destruction replacement ${replacement.legacyId}.incomingPosition`),
    reason: text(replacement.reason, `destruction replacement ${replacement.legacyId}.reason`, 500, 2),
    effectiveAt: instant(replacement.effectiveAt, `destruction replacement ${replacement.legacyId}.effectiveAt`),
  }));
  uniqueBy(replacements, (replacement) => replacement.id, `destruction ${source.legacyId} replacements`);

  const rosterSnapshots: DestructionFixtureRosterSnapshot[] = [];
  const mvpBallots: DestructionMvpBallot[] = [];
  for (const fixture of source.fixtures) {
    if (!canImportMvpHistory) continue;
    const fixtureId = fixture.stage === "PRELIMINARY" ? fixture.id : requireValue(tournament.fixtureIdByLegacyId.get(fixture.legacyId), `destruction fixture ${fixture.legacyId} has no bracket mapping.`);
    const state = ballotAndSnapshot(fixture, fixtureId, participants);
    if (state.snapshot) rosterSnapshots.push(state.snapshot);
    if (state.ballot) mvpBallots.push(state.ballot);
  }
  uniqueBy(mvpBallots, (ballot) => ballot.fixtureId, `destruction ${source.legacyId} MVP ballots`);
  const winnerTeamId = source.winnerTeamId === null ? null : uuid(source.winnerTeamId, `destruction ${source.legacyId}.winnerTeamId`);
  if (winnerTeamId !== (tournament.bracket?.championTeamId ?? null)) fail(`destruction ${source.legacyId} winner disagrees with its tournament bracket.`);
  if (canImportMvpHistory && source.mvpPlayerId !== null && !mvpBallots.some((ballot) => ballot.finalizedPlayerId === source.mvpPlayerId)) fail(`destruction ${source.legacyId} overall MVP has no matching finalized fixture ballot.`);
  if (lifecycle.status === "COMPLETED" && !winnerTeamId) fail(`completed destruction ${source.legacyId} has no bracket winner.`);

  return Object.freeze({
    id,
    revision: 1,
    title: text(source.title, `destruction ${source.legacyId}.title`, 120),
    lifecycle,
    configuration,
    applications: Object.freeze(applications),
    teams: Object.freeze(teams),
    participants: Object.freeze(participants),
    auctionSeed: teams.length > 0 ? `v1-import-${id}` : null,
    preliminaryFixtures,
    qualifiedTeamIds: tournament.qualifiedTeamIds,
    tournamentBracket: tournament.bracket,
    rosterSnapshots: Object.freeze(rosterSnapshots),
    replacements: Object.freeze(replacements),
    mvpBallots: Object.freeze(mvpBallots),
    galleryId: null,
    createdAt,
    updatedAt,
  });
}

async function rows<T extends QueryResultRow>(client: CutoverClient, statement: string, parameters: readonly unknown[] = []): Promise<T[]> {
  const result = await client.query(statement, [...parameters]);
  return result.rows as T[];
}

function dateValue(value: Date | string | null, label: string) {
  return value === null ? null : instant(value instanceof Date ? value.toISOString() : value, label);
}

function numeric(value: number | string, label: string) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) fail(`${label} is not numeric.`);
  return parsed;
}

type ParentRow = QueryResultRow & Record<string, unknown> & { legacy_id: number; id: string };

async function loadLegacyEvents(client: CutoverClient): Promise<LegacyEventCompetition[]> {
  const parents = await rows<ParentRow>(client, `select e.*, pg_temp.klol_legacy_uuid('competition.event_competitions', e.id)::text as id, e.id as legacy_id from public."EventMatch" e order by e.id`);
  const teams = await rows<ParentRow>(client, `select t.*, pg_temp.klol_legacy_uuid('competition.event_teams', t.id)::text as id, t.id as legacy_id from public."EventTeam" t order by t."eventId", t.id`);
  const participants = await rows<ParentRow>(client, `select p.*, pg_temp.klol_legacy_uuid('competition.event_participants', p.id)::text as id, p.id as legacy_id, rp.id::text as player_uuid, rp.user_account_id::text as owner_uuid, pg_temp.klol_legacy_uuid('competition.event_teams', p."teamId")::text as team_uuid, pg_temp.klol_legacy_uuid('registry.players', p."playerId")::text as expected_player_uuid from public."EventParticipant" p left join registry.players rp on rp.legacy_id = p."playerId" order by p."eventId", p.id`);
  const applications = await rows<ParentRow>(client, `select a.*, array_to_json(a."subPositions") as "subPositions", pg_temp.klol_legacy_uuid('competition.event_applications', a.id)::text as id, a.id as legacy_id, rp.id::text as player_uuid, rp.user_account_id::text as owner_uuid, pg_temp.klol_legacy_uuid('registry.players', a."playerId")::text as expected_player_uuid from public."EventParticipationApply" a left join registry.players rp on rp.legacy_id = a."playerId" order by a."eventId", a.id`);
  const fixtures = await rows<ParentRow>(client, `select m.*, pg_temp.klol_legacy_uuid('competition.event_fixtures', m.id)::text as id, m.id as legacy_id, pg_temp.klol_legacy_uuid('competition.event_teams', m."teamAId")::text as team_a_uuid, pg_temp.klol_legacy_uuid('competition.event_teams', m."teamBId")::text as team_b_uuid, pg_temp.klol_legacy_uuid('competition.event_teams', m."winnerTeamId")::text as winner_team_uuid, rp.id::text as mvp_player_uuid, pg_temp.klol_legacy_uuid('registry.players', m."mvpPlayerId")::text as expected_mvp_player_uuid from public."EventTournamentMatch" m left join registry.players rp on rp.legacy_id = m."mvpPlayerId" order by m."eventId", m.id`);
  return parents.map((row) => {
    const legacyId = Number(row.legacy_id);
    const eventTeams = teams.filter((team) => Number(team.eventId) === legacyId).map((team): LegacyEventTeam => ({ legacyId: Number(team.legacy_id), id: String(team.id), name: String(team.name), seed: team.seed === null ? null : Number(team.seed), score: numeric(team.score as number | string, `event team ${team.legacy_id}.score`) }));
    const eventParticipants = participants.filter((entry) => Number(entry.eventId) === legacyId).map((entry): LegacyEventParticipant => {
      if (!entry.player_uuid || entry.player_uuid !== entry.expected_player_uuid) fail(`event participant ${entry.legacy_id} is missing its deterministic registry player mapping.`);
      return { legacyId: Number(entry.legacy_id), id: String(entry.id), playerId: String(entry.player_uuid), ownerUserAccountId: entry.owner_uuid ? String(entry.owner_uuid) : null, teamId: entry.teamId === null ? null : String(entry.team_uuid), position: entry.position === null ? null : String(entry.position), balanceScore: numeric(entry.balanceScore as number | string, `event participant ${entry.legacy_id}.balanceScore`) };
    });
    const eventApplications = applications.filter((entry) => Number(entry.eventId) === legacyId).map((entry): LegacyEventApplication => {
      if (!entry.player_uuid || entry.player_uuid !== entry.expected_player_uuid) fail(`event application ${entry.legacy_id} is missing its deterministic registry player mapping.`);
      return { legacyId: Number(entry.legacy_id), id: String(entry.id), playerId: String(entry.player_uuid), ownerUserAccountId: entry.owner_uuid ? String(entry.owner_uuid) : null, mainPosition: entry.mainPosition === null ? null : String(entry.mainPosition), subPositions: Array.isArray(entry.subPositions) ? entry.subPositions.map(String) : fail(`event application ${entry.legacy_id} subPositions is not an array.`), status: String(entry.status) };
    });
    const eventFixtures = fixtures.filter((entry) => Number(entry.eventId) === legacyId).map((entry): LegacyEventFixture => {
      if (entry.mvp_player_uuid && entry.mvp_player_uuid !== entry.expected_mvp_player_uuid) fail(`event fixture ${entry.legacy_id} has a non-deterministic MVP player mapping.`);
      return { legacyId: Number(entry.legacy_id), id: String(entry.id), stage: String(entry.stage) as BracketFixture["stage"], round: Number(entry.round), teamAId: String(entry.team_a_uuid), teamBId: String(entry.team_b_uuid), winnerTeamId: entry.winnerTeamId === null ? null : String(entry.winner_team_uuid), mvpPlayerId: entry.mvp_player_uuid ? String(entry.mvp_player_uuid) : null };
    });
    const winnerTeamId = row.winnerTeamId === null ? null : String(eventTeams.find((team) => team.legacyId === Number(row.winnerTeamId))?.id ?? fail(`event ${legacyId} winner team is missing.`));
    const rawMvpParticipant = row.mvpPlayerId === null ? null : participants.find((entry) => Number(entry.eventId) === legacyId && Number(entry.playerId) === Number(row.mvpPlayerId));
    const mvpPlayerId = rawMvpParticipant?.player_uuid ? String(rawMvpParticipant.player_uuid) : null;
    const recruitFrom = dateValue(row.recruitFrom as Date | string | null, `event ${legacyId}.recruitFrom`);
    const rawRecruitTo = dateValue(row.recruitTo as Date | string | null, `event ${legacyId}.recruitTo`);
    const recruitTo = recruitFrom !== null && rawRecruitTo !== null && Date.parse(rawRecruitTo) <= Date.parse(recruitFrom)
      ? new Date(Date.parse(recruitFrom) + 1_000).toISOString()
      : rawRecruitTo;
    const status = String(row.status) === "COMPLETED" && mvpPlayerId === null ? "IN_PROGRESS" : String(row.status);
    return { legacyId, id: String(row.id), title: String(row.title), description: row.description === null ? null : String(row.description), status, mode: String(row.mode), eventDate: dateValue(row.eventDate as Date | string, `event ${legacyId}.eventDate`)!, recruitFrom, recruitTo, winnerTeamId, mvpPlayerId, galleryImageId: row.galleryImageId === null ? null : Number(row.galleryImageId), createdAt: dateValue(row.createdAt as Date | string, `event ${legacyId}.createdAt`)!, updatedAt: dateValue(row.updatedAt as Date | string, `event ${legacyId}.updatedAt`)!, teams: eventTeams, participants: eventParticipants, applications: eventApplications, fixtures: eventFixtures };
  });
}

async function loadLegacyDestructions(client: CutoverClient): Promise<LegacyDestructionCompetition[]> {
  const parents = await rows<ParentRow>(client, `select d.*, pg_temp.klol_legacy_uuid('competition.destruction_competitions', d.id)::text as id, d.id as legacy_id from public."DestructionTournament" d order by d.id`);
  const applications = await rows<ParentRow>(client, `select a.*, array_to_json(a."subPositions") as "subPositions", pg_temp.klol_legacy_uuid('competition.destruction_applications', a.id)::text as id, a.id as legacy_id, rp.id::text as player_uuid, rp.user_account_id::text as owner_uuid, pg_temp.klol_legacy_uuid('registry.players', a."playerId")::text as expected_player_uuid from public."DestructionParticipationApply" a left join registry.players rp on rp.legacy_id = a."playerId" order by a."tournamentId", a.id`);
  const participants = await rows<ParentRow>(client, `select p.*, pg_temp.klol_legacy_uuid('competition.destruction_participants', p.id)::text as id, p.id as legacy_id, rp.id::text as player_uuid, pg_temp.klol_legacy_uuid('registry.players', p."playerId")::text as expected_player_uuid, pg_temp.klol_legacy_uuid('competition.destruction_teams', p."teamId")::text as team_uuid from public."DestructionParticipant" p left join registry.players rp on rp.legacy_id = p."playerId" order by p."tournamentId", p.id`);
  const teams = await rows<ParentRow>(client, `select t.*, pg_temp.klol_legacy_uuid('competition.destruction_teams', t.id)::text as id, t.id as legacy_id, rp.id::text as captain_player_uuid, pg_temp.klol_legacy_uuid('registry.players', t."captainId")::text as expected_captain_player_uuid from public."DestructionTeam" t left join registry.players rp on rp.legacy_id = t."captainId" order by t."tournamentId", t.id`);
  const fixtures = await rows<ParentRow>(client, `select m.*, pg_temp.klol_legacy_uuid('competition.destruction_fixtures', m.id)::text as id, m.id as legacy_id, pg_temp.klol_legacy_uuid('competition.destruction_teams', m."teamAId")::text as team_a_uuid, pg_temp.klol_legacy_uuid('competition.destruction_teams', m."teamBId")::text as team_b_uuid, pg_temp.klol_legacy_uuid('competition.destruction_teams', m."winnerTeamId")::text as winner_team_uuid, rp.id::text as mvp_player_uuid, pg_temp.klol_legacy_uuid('registry.players', m."mvpPlayerId")::text as expected_mvp_player_uuid from public."DestructionMatch" m left join registry.players rp on rp.legacy_id = m."mvpPlayerId" order by m."tournamentId", m.id`);
  const votes = await rows<ParentRow>(client, `select v.id as legacy_id, v."matchId", voter.id::text as voter_player_uuid, candidate.id::text as candidate_player_uuid, pg_temp.klol_legacy_uuid('registry.players', vp.id)::text as expected_voter_player_uuid, pg_temp.klol_legacy_uuid('registry.players', v."candidatePlayerId")::text as expected_candidate_player_uuid from public."DestructionMatchMvpVote" v left join public."Player" vp on vp."userAccountId" = v."voterUserAccountId" left join registry.players voter on voter.legacy_id = vp.id left join registry.players candidate on candidate.legacy_id = v."candidatePlayerId" order by v."matchId", v.id`);
  const replacements = await rows<ParentRow>(client, `select r.*, pg_temp.klol_legacy_uuid('competition.destruction_replacements', r.id)::text as id, r.id as legacy_id, pg_temp.klol_legacy_uuid('competition.destruction_participants', r."participantId")::text as participant_uuid, pg_temp.klol_legacy_uuid('competition.destruction_teams', r."teamId")::text as team_uuid, outgoing.id::text as outgoing_player_uuid, incoming.id::text as incoming_player_uuid, pg_temp.klol_legacy_uuid('registry.players', r."outgoingPlayerId")::text as expected_outgoing_player_uuid, pg_temp.klol_legacy_uuid('registry.players', r."incomingPlayerId")::text as expected_incoming_player_uuid from public."DestructionParticipantReplacement" r left join registry.players outgoing on outgoing.legacy_id = r."outgoingPlayerId" left join registry.players incoming on incoming.legacy_id = r."incomingPlayerId" order by r."tournamentId", r."effectiveAt", r.id`);
  return parents.map((row) => {
    const legacyId = Number(row.legacy_id);
    const competitionApplications = applications.filter((entry) => Number(entry.tournamentId) === legacyId).map((entry): LegacyDestructionApplication => {
      if (!entry.player_uuid || entry.player_uuid !== entry.expected_player_uuid) fail(`destruction application ${entry.legacy_id} is missing its deterministic registry player mapping.`);
      const subPositions = Array.isArray(entry.subPositions) ? entry.subPositions.map(String) : fail(`destruction application ${entry.legacy_id} subPositions is not an array.`);
      return { legacyId: Number(entry.legacy_id), id: String(entry.id), playerId: String(entry.player_uuid), ownerUserAccountId: entry.owner_uuid ? String(entry.owner_uuid) : null, position: String(entry.mainPosition), subPositions, status: String(entry.status) };
    });
    const competitionParticipants = participants.filter((entry) => Number(entry.tournamentId) === legacyId).map((entry): LegacyDestructionParticipant => {
      if (!entry.player_uuid || entry.player_uuid !== entry.expected_player_uuid) fail(`destruction participant ${entry.legacy_id} is missing its deterministic registry player mapping.`);
      return { legacyId: Number(entry.legacy_id), id: String(entry.id), playerId: String(entry.player_uuid), teamId: entry.teamId === null ? null : String(entry.team_uuid), position: String(entry.position), isCaptain: Boolean(entry.isCaptain), auctionStatus: String(entry.auctionStatus), purchasePoints: entry.purchasePoint === null ? null : Number(entry.purchasePoint), drawOrder: entry.drawOrder === null ? null : Number(entry.drawOrder) };
    });
    const competitionTeams = teams.filter((entry) => Number(entry.tournamentId) === legacyId).map((entry): LegacyDestructionTeam => {
      if (!entry.captain_player_uuid || entry.captain_player_uuid !== entry.expected_captain_player_uuid) fail(`destruction team ${entry.legacy_id} is missing its deterministic captain player mapping.`);
      return { legacyId: Number(entry.legacy_id), id: String(entry.id), name: String(entry.name), captainPlayerId: String(entry.captain_player_uuid), initialAuctionPoints: Number(entry.initialAuctionPoints), remainingAuctionPoints: Number(entry.remainingAuctionPoints), points: Number(entry.points), wins: Number(entry.wins), losses: Number(entry.losses) };
    });
    const competitionFixtures = fixtures.filter((entry) => Number(entry.tournamentId) === legacyId).map((entry): LegacyDestructionFixture => {
      if (entry.mvpPlayerId !== null && (!entry.mvp_player_uuid || entry.mvp_player_uuid !== entry.expected_mvp_player_uuid)) fail(`destruction fixture ${entry.legacy_id} is missing its deterministic MVP player mapping.`);
      const fixtureVotes = votes.filter((vote) => Number(vote.matchId) === Number(entry.legacy_id)).map((vote): LegacyDestructionVote => {
        if (!vote.voter_player_uuid || vote.voter_player_uuid !== vote.expected_voter_player_uuid || !vote.candidate_player_uuid || vote.candidate_player_uuid !== vote.expected_candidate_player_uuid) fail(`destruction MVP vote ${vote.legacy_id} is missing a deterministic player mapping.`);
        return { voterPlayerId: String(vote.voter_player_uuid), candidatePlayerId: String(vote.candidate_player_uuid) };
      });
      const revoteIds = Array.isArray(entry.mvpRevoteCandidateIds) ? entry.mvpRevoteCandidateIds : fail(`destruction fixture ${entry.legacy_id} revote candidates is not an array.`);
      const mappedRevoteIds = revoteIds.map((candidate) => String(requireValue(
        participants.find((participant) => Number(participant.tournamentId) === legacyId && Number(participant.playerId) === Number(candidate))?.player_uuid,
        `destruction fixture ${entry.legacy_id} revote candidate ${candidate} is missing.`,
      )));
      return { legacyId: Number(entry.legacy_id), id: String(entry.id), stage: String(entry.stage) as LegacyDestructionFixture["stage"], round: Number(entry.round), groupKey: entry.preliminaryGroup === null ? null : String(entry.preliminaryGroup), teamAId: String(entry.team_a_uuid), teamBId: String(entry.team_b_uuid), winnerTeamId: entry.winnerTeamId === null ? null : String(entry.winner_team_uuid), mvpPlayerId: entry.mvpPlayerId === null ? null : String(entry.mvp_player_uuid), mvpSelectionMethod: entry.mvpSelectionMethod === null ? null : String(entry.mvpSelectionMethod) as "VOTE" | "ADMIN", mvpFinalizedAt: dateValue(entry.mvpFinalizedAt as Date | string | null, `destruction fixture ${entry.legacy_id}.mvpFinalizedAt`), mvpVoteRound: Number(entry.mvpVoteRound), mvpRevoteCandidatePlayerIds: mappedRevoteIds, isReplay: Boolean(entry.isReplay), isConfirmed: Boolean(entry.isConfirmed), matchDate: dateValue(entry.matchDate as Date | string | null, `destruction fixture ${entry.legacy_id}.matchDate`), bestOf: Number(entry.bestOf), teamAScore: Number(entry.teamAScore), teamBScore: Number(entry.teamBScore), updatedAt: dateValue(entry.updatedAt as Date | string, `destruction fixture ${entry.legacy_id}.updatedAt`)!, votes: fixtureVotes };
    });
    const competitionReplacements = replacements.filter((entry) => Number(entry.tournamentId) === legacyId).map((entry): LegacyDestructionReplacement => {
      if (!entry.outgoing_player_uuid || entry.outgoing_player_uuid !== entry.expected_outgoing_player_uuid || !entry.incoming_player_uuid || entry.incoming_player_uuid !== entry.expected_incoming_player_uuid) fail(`destruction replacement ${entry.legacy_id} is missing a deterministic player mapping.`);
      return { legacyId: Number(entry.legacy_id), id: String(entry.id), participantId: String(entry.participant_uuid), teamId: String(entry.team_uuid), outgoingPlayerId: String(entry.outgoing_player_uuid), incomingPlayerId: String(entry.incoming_player_uuid), outgoingPosition: String(entry.outgoingPosition), incomingPosition: String(entry.incomingPosition), reason: String(entry.reason), effectiveAt: dateValue(entry.effectiveAt as Date | string, `destruction replacement ${entry.legacy_id}.effectiveAt`)! };
    });
    const winnerTeamId = row.winnerTeamId === null ? null : requireValue(competitionTeams.find((team) => team.legacyId === Number(row.winnerTeamId))?.id, `destruction ${legacyId} winner team is missing.`);
    const mvpPlayerId = row.mvpPlayerId === null ? null : String(requireValue(
      participants.find((participant) => Number(participant.tournamentId) === legacyId && Number(participant.playerId) === Number(row.mvpPlayerId))?.player_uuid,
      `destruction ${legacyId} MVP player is missing.`,
    ));
    return { legacyId, id: String(row.id), title: String(row.title), description: row.description === null ? null : String(row.description), status: String(row.status), startDate: dateValue(row.startDate as Date | string | null, `destruction ${legacyId}.startDate`), endDate: dateValue(row.endDate as Date | string | null, `destruction ${legacyId}.endDate`), preliminaryFormat: String(row.preliminaryFormat), preliminaryBestOf: Number(row.preliminaryBestOf), preliminaryRoundCount: Number(row.preliminaryRoundCount), advanceTeamCount: Number(row.advanceTeamCount), laneLimits: { TOP: Number(row.topLaneLimit), JGL: Number(row.jungleLaneLimit), MID: Number(row.midLaneLimit), ADC: Number(row.adcLaneLimit), SUP: Number(row.supportLaneLimit) }, winnerTeamId, mvpPlayerId, galleryImageId: row.galleryImageId === null ? null : Number(row.galleryImageId), createdAt: dateValue(row.createdAt as Date | string, `destruction ${legacyId}.createdAt`)!, updatedAt: dateValue(row.updatedAt as Date | string, `destruction ${legacyId}.updatedAt`)!, applications: competitionApplications, participants: competitionParticipants, teams: competitionTeams, fixtures: competitionFixtures, replacements: competitionReplacements };
  });
}

function normalized(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("ko-KR");
}

async function insertEvent(client: CutoverClient, aggregate: EventAggregate, actorUserAccountId: string) {
  const active = aggregate.participants.filter((participant) => participant.status === "ACTIVE").length;
  const inserted = await client.query(`insert into competition.event_competitions (id, title, title_normalized, description, format, status, recruitment_opens_at, recruitment_closes_at, bracket_best_of, active_participant_count, aggregate_json, revision, created_by_user_account_id, updated_by_user_account_id, created_at, updated_at) values ($1::uuid,$2,$3,$4,$5,$6,$7::timestamptz,$8::timestamptz,$9,$10,$11::jsonb,$12,$13::uuid,$13::uuid,$14::timestamptz,$15::timestamptz) on conflict (id) do nothing`, [aggregate.id, aggregate.settings.title, normalized(aggregate.settings.title), aggregate.settings.description, aggregate.settings.format, aggregate.lifecycle.status, aggregate.settings.recruitmentOpensAt, aggregate.settings.recruitmentClosesAt, aggregate.settings.bracketBestOf, active, JSON.stringify(aggregate), aggregate.revision, actorUserAccountId, aggregate.createdAt, aggregate.updatedAt]);
  const exact = await rows(client, `select 1 from competition.event_competitions where id=$1::uuid and title=$2 and title_normalized=$3 and description is not distinct from $4 and format=$5 and status=$6 and recruitment_opens_at=$7::timestamptz and recruitment_closes_at=$8::timestamptz and bracket_best_of=$9 and active_participant_count=$10 and aggregate_json=$11::jsonb and revision=$12 and created_by_user_account_id=$13::uuid and updated_by_user_account_id=$13::uuid and created_at=$14::timestamptz and updated_at=$15::timestamptz`, [aggregate.id, aggregate.settings.title, normalized(aggregate.settings.title), aggregate.settings.description, aggregate.settings.format, aggregate.lifecycle.status, aggregate.settings.recruitmentOpensAt, aggregate.settings.recruitmentClosesAt, aggregate.settings.bracketBestOf, active, JSON.stringify(aggregate), aggregate.revision, actorUserAccountId, aggregate.createdAt, aggregate.updatedAt]);
  if (exact.length !== 1) fail(`existing event target ${aggregate.id} differs from the V1 projection.`);
  for (const participant of aggregate.participants) {
    await client.query(`insert into competition.event_participant_index (event_id, participant_id, player_id, owner_user_account_id, source, status, main_position, sub_positions_json, updated_at) values ($1::uuid,$2,$3::uuid,$4::uuid,$5,$6,$7,$8::jsonb,$9::timestamptz) on conflict (event_id, participant_id) do nothing`, [aggregate.id, participant.id, participant.playerId, participant.ownerUserAccountId, participant.source, participant.status, participant.mainPosition, JSON.stringify(participant.subPositions), aggregate.updatedAt]);
    const index = await rows(client, `select 1 from competition.event_participant_index where event_id=$1::uuid and participant_id=$2 and player_id=$3::uuid and owner_user_account_id is not distinct from $4::uuid and source=$5 and status=$6 and main_position is not distinct from $7 and sub_positions_json=$8::jsonb and updated_at=$9::timestamptz`, [aggregate.id, participant.id, participant.playerId, participant.ownerUserAccountId, participant.source, participant.status, participant.mainPosition, JSON.stringify(participant.subPositions), aggregate.updatedAt]);
    if (index.length !== 1) fail(`event participant index ${participant.id} differs from its imported aggregate.`);
  }
  const indexCount = await rows<{ count: string } & QueryResultRow>(client, `select count(*)::text as count from competition.event_participant_index where event_id=$1::uuid`, [aggregate.id]);
  if (Number(indexCount[0]?.count) !== aggregate.participants.length) fail(`event ${aggregate.id} participant index count does not reconcile.`);
  return inserted.rowCount ?? 0;
}

async function insertDestruction(client: CutoverClient, aggregate: DestructionAggregate, actorUserAccountId: string) {
  const inserted = await client.query(`insert into competition.destruction_competitions (id,title,title_normalized,status,preliminary_format,team_count,participant_count,gallery_id,aggregate_json,revision,created_by_user_account_id,updated_by_user_account_id,created_at,updated_at) values ($1::uuid,$2,$3,$4,$5,$6,$7,null,$8::jsonb,$9,$10::uuid,$10::uuid,$11::timestamptz,$12::timestamptz) on conflict (id) do nothing`, [aggregate.id, aggregate.title, normalized(aggregate.title), aggregate.lifecycle.status, aggregate.configuration.preliminaryFormat, aggregate.configuration.teamCount, aggregate.participants.length, JSON.stringify(aggregate), aggregate.revision, actorUserAccountId, aggregate.createdAt, aggregate.updatedAt]);
  const exact = await rows(client, `select 1 from competition.destruction_competitions where id=$1::uuid and title=$2 and title_normalized=$3 and status=$4 and preliminary_format=$5 and team_count=$6 and participant_count=$7 and gallery_id is null and aggregate_json=$8::jsonb and revision=$9 and created_by_user_account_id=$10::uuid and updated_by_user_account_id=$10::uuid and created_at=$11::timestamptz and updated_at=$12::timestamptz`, [aggregate.id, aggregate.title, normalized(aggregate.title), aggregate.lifecycle.status, aggregate.configuration.preliminaryFormat, aggregate.configuration.teamCount, aggregate.participants.length, JSON.stringify(aggregate), aggregate.revision, actorUserAccountId, aggregate.createdAt, aggregate.updatedAt]);
  if (exact.length !== 1) fail(`existing destruction target ${aggregate.id} differs from the V1 projection.`);
  for (const application of aggregate.applications) {
    await client.query(`insert into competition.destruction_application_index (tournament_id,application_id,owner_user_account_id,player_id,position,status,updated_at) values ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6,$7::timestamptz) on conflict (tournament_id,application_id) do nothing`, [aggregate.id, application.id, application.userAccountId, application.playerId, application.position, application.status, aggregate.updatedAt]);
    const index = await rows(client, `select 1 from competition.destruction_application_index where tournament_id=$1::uuid and application_id=$2::uuid and owner_user_account_id=$3::uuid and player_id=$4::uuid and position=$5 and status=$6 and updated_at=$7::timestamptz`, [aggregate.id, application.id, application.userAccountId, application.playerId, application.position, application.status, aggregate.updatedAt]);
    if (index.length !== 1) fail(`destruction application index ${application.id} differs from its imported aggregate.`);
  }
  const indexCount = await rows<{ count: string } & QueryResultRow>(client, `select count(*)::text as count from competition.destruction_application_index where tournament_id=$1::uuid`, [aggregate.id]);
  if (Number(indexCount[0]?.count) !== aggregate.applications.length) fail(`destruction ${aggregate.id} application index count does not reconcile.`);
  return inserted.rowCount ?? 0;
}

/**
 * Imports only after the caller has opened the cutover transaction and installed
 * pg_temp.klol_legacy_uuid. It never begins, commits, or rolls back that transaction.
 */
export async function importV1Competitions(
  client: CutoverClient,
  options: ImportV1CompetitionsOptions,
): Promise<readonly CutoverStepResult[]> {
  const actorUserAccountId = uuid(options.actorUserAccountId, "cutover actorUserAccountId");
  const actor = await rows(client, `select id from auth.user_accounts where id=$1::uuid and role='SUPER_ADMIN' and status='APPROVED'`, [actorUserAccountId]);
  if (actor.length !== 1) fail("the explicit cutover actor is not one approved V2 SUPER_ADMIN account.");
  await client.query(`select pg_advisory_xact_lock(hashtextextended('klol-v2:cutover:competitions', 0))`);

  // Build and validate the complete source projection before the first target write.
  const eventAggregates = (await loadLegacyEvents(client)).map(buildImportedEventAggregate);
  const destructionAggregates = (await loadLegacyDestructions(client)).map(buildImportedDestructionAggregate);
  let eventInserted = 0;
  let destructionInserted = 0;
  for (const aggregate of eventAggregates) eventInserted += await insertEvent(client, aggregate, actorUserAccountId);
  for (const aggregate of destructionAggregates) destructionInserted += await insertDestruction(client, aggregate, actorUserAccountId);

  const eventTargets = await rows<{ count: string } & QueryResultRow>(client, `select count(*)::text as count from public."EventMatch" source join competition.event_competitions target on target.id=pg_temp.klol_legacy_uuid('competition.event_competitions', source.id)`);
  const destructionTargets = await rows<{ count: string } & QueryResultRow>(client, `select count(*)::text as count from public."DestructionTournament" source join competition.destruction_competitions target on target.id=pg_temp.klol_legacy_uuid('competition.destruction_competitions', source.id)`);
  const eventTargetCount = safeInteger(Number(eventTargets[0]?.count), "event target reconciliation count");
  const destructionTargetCount = safeInteger(Number(destructionTargets[0]?.count), "destruction target reconciliation count");
  if (eventTargetCount !== eventAggregates.length || destructionTargetCount !== destructionAggregates.length) fail("source/target competition counts do not reconcile.");
  return Object.freeze([
    { name: "event-competitions", sourceCount: eventAggregates.length, targetCount: eventTargetCount, insertedCount: eventInserted },
    { name: "destruction-competitions", sourceCount: destructionAggregates.length, targetCount: destructionTargetCount, insertedCount: destructionInserted },
  ]);
}
