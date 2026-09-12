import type {
  TeamBalanceCalculation,
  TeamBalanceEligibility,
} from "@/modules/team-tools";

import {
  advanceSingleEliminationBracket,
  buildSingleEliminationBracket,
  canonicalIdentifier,
  COMPETITION_POSITIONS,
  compareCanonicalIdentifiers,
  CompetitionCoreError,
  INITIAL_EVENT_LIFECYCLE,
  transitionEventLifecycle,
  validateCompetitionRoster,
  type CompetitionPosition,
  type CompetitionRoster,
  type EventLifecycle,
  type SingleEliminationBracket,
} from "../../core";

export const EVENT_FORMATS = ["POSITION", "ARAM"] as const;
export type EventFormat = (typeof EVENT_FORMATS)[number];

export type EventSettings = Readonly<{
  title: string;
  description: string | null;
  format: EventFormat;
  recruitmentOpensAt: string;
  recruitmentClosesAt: string;
  bracketBestOf: number;
}>;

export type EventPositionPreference = Readonly<{
  mainPosition: CompetitionPosition | null;
  subPositions: readonly CompetitionPosition[];
}>;

export type EventParticipant = EventPositionPreference & Readonly<{
  id: string;
  playerId: string;
  ownerUserAccountId: string | null;
  source: "USER_APPLICATION" | "ADMIN_IMPORT" | "ADMIN_MANUAL";
  status: "ACTIVE" | "CANCELLED";
}>;

export type EventTeam = Readonly<{
  id: string;
  name: string;
  seed: number | null;
  balanceScore: number;
  members: readonly Readonly<{
    participantId: string;
    position: CompetitionPosition | null;
  }>[];
}>;

export type EventAggregate = Readonly<{
  id: string;
  galleryId: string | null;
  settings: EventSettings;
  lifecycle: EventLifecycle;
  participants: readonly EventParticipant[];
  teams: readonly EventTeam[];
  bracket: SingleEliminationBracket | null;
  winnerTeamId: string | null;
  mvpParticipantId: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
}>;

export type EventParticipantInput = EventPositionPreference & Readonly<{
  id: string;
  playerId: string;
  ownerUserAccountId?: string | null;
}>;

export type EventTeamBalanceParticipant = Readonly<{
  participantId: string;
  playerId: string;
  eligiblePositions: readonly TeamBalanceEligibility[];
}>;

export type EventResultCorrectionPlan = Readonly<{
  correctedFixtureId: string;
  downstreamFixtureIds: readonly string[];
  invalidatedResultFixtureIds: readonly string[];
  previousWinnerTeamId: string;
  nextWinnerTeamId: string;
}>;

export const EVENT_DOMAIN_ERROR_CODES = [
  "APPLICATION_CLOSED",
  "DUPLICATE_PARTICIPANT",
  "IDEMPOTENCY_MISMATCH",
  "INVALID_AUTHORIZATION_INTENT",
  "INVALID_INPUT",
  "INVALID_RESULT",
  "INVALID_STATE",
  "NOT_FOUND",
  "PRECONDITION_FAILED",
  "REVISION_CONFLICT",
] as const;
export type EventDomainErrorCode = (typeof EVENT_DOMAIN_ERROR_CODES)[number];

export class EventDomainError extends Error {
  constructor(
    readonly code: EventDomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "EventDomainError";
  }
}

const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;

function failUnless(condition: unknown, code: EventDomainErrorCode, message: string): asserts condition {
  if (!condition) throw new EventDomainError(code, message);
}

function validateEventRoster(roster: CompetitionRoster) {
  try {
    return validateCompetitionRoster(roster);
  } catch (error) {
    throw new EventDomainError(
      "PRECONDITION_FAILED",
      error instanceof Error ? error.message : "Event roster is invalid.",
    );
  }
}

function canonicalInstant(value: string, label: string) {
  const time = Date.parse(value);
  failUnless(Number.isFinite(time) && new Date(time).toISOString() === value, "INVALID_INPUT", `${label} must be a canonical ISO instant.`);
  return time;
}

function safeText(value: string, maximum: number, label: string, required: boolean) {
  const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  failUnless((!required || normalized.length > 0) && normalized.length <= maximum && !UNSAFE_TEXT.test(value), "INVALID_INPUT", `${label} is invalid.`);
  return normalized;
}

function validateSettings(settings: EventSettings): EventSettings {
  const title = safeText(settings.title, 120, "title", true);
  const description = settings.description === null ? null : safeText(settings.description, 2_000, "description", false) || null;
  failUnless(EVENT_FORMATS.includes(settings.format), "INVALID_INPUT", "Event format is invalid.");
  const opensAt = canonicalInstant(settings.recruitmentOpensAt, "recruitmentOpensAt");
  const closesAt = canonicalInstant(settings.recruitmentClosesAt, "recruitmentClosesAt");
  failUnless(closesAt > opensAt, "INVALID_INPUT", "Recruitment must close after it opens.");
  try {
    buildSingleEliminationBracket({
      competitionId: "best-of-validation",
      teams: [{ id: "team-a" }, { id: "team-b" }],
      bestOf: settings.bracketBestOf,
    });
  } catch {
    throw new EventDomainError("INVALID_INPUT", "bracketBestOf is invalid.");
  }
  return Object.freeze({ ...settings, title, description });
}

function validatePreference(format: EventFormat, preference: EventPositionPreference): EventPositionPreference {
  if (format === "ARAM") {
    failUnless(preference.mainPosition === null && preference.subPositions.length === 0, "INVALID_INPUT", "ARAM applications do not select positions.");
    return { mainPosition: null, subPositions: Object.freeze([]) };
  }
  failUnless(
    preference.mainPosition !== null && COMPETITION_POSITIONS.includes(preference.mainPosition),
    "INVALID_INPUT",
    "POSITION applications require a valid main position.",
  );
  failUnless(
    preference.subPositions.every((position) => COMPETITION_POSITIONS.includes(position)),
    "INVALID_INPUT",
    "An application contains an invalid sub position.",
  );
  const unique = new Set(preference.subPositions);
  failUnless(
    unique.size === preference.subPositions.length &&
      !unique.has(preference.mainPosition) &&
      preference.subPositions.length <= 4,
    "INVALID_INPUT",
    "Sub positions must be unique and exclude the main position.",
  );
  return {
    mainPosition: preference.mainPosition,
    subPositions: Object.freeze([...preference.subPositions]),
  };
}

function updated(aggregate: EventAggregate, now: string, fields: Partial<EventAggregate>): EventAggregate {
  canonicalInstant(now, "now");
  return Object.freeze({ ...aggregate, ...fields, updatedAt: now });
}

function editableParticipants(aggregate: EventAggregate, administrator: boolean, now: string) {
  failUnless(aggregate.teams.length === 0 && aggregate.bracket === null, "INVALID_STATE", "Participants are locked after teams are built.");
  if (administrator) {
    failUnless(
      aggregate.lifecycle.status === "RECRUITING" || aggregate.lifecycle.status === "TEAM_BUILDING",
      "INVALID_STATE",
      "Administrators may edit participants only during recruitment or team building.",
    );
    return;
  }
  failUnless(eventAcceptsApplications(aggregate, now), "APPLICATION_CLOSED", "Event applications are closed.");
}

export function createEventAggregate(input: Readonly<{
  id: string;
  settings: EventSettings;
  now: string;
}>): EventAggregate {
  const id = canonicalIdentifier(input.id, "eventId");
  const now = new Date(canonicalInstant(input.now, "now")).toISOString();
  return Object.freeze({
    id,
    galleryId: null,
    settings: validateSettings(input.settings),
    lifecycle: INITIAL_EVENT_LIFECYCLE,
    participants: Object.freeze([]),
    teams: Object.freeze([]),
    bracket: null,
    winnerTeamId: null,
    mvpParticipantId: null,
    revision: 0,
    createdAt: now,
    updatedAt: now,
  });
}

export function eventAcceptsApplications(aggregate: EventAggregate, now: string) {
  const current = canonicalInstant(now, "now");
  return aggregate.lifecycle.status === "RECRUITING" &&
    current >= canonicalInstant(aggregate.settings.recruitmentOpensAt, "recruitmentOpensAt") &&
    current < canonicalInstant(aggregate.settings.recruitmentClosesAt, "recruitmentClosesAt");
}

export function replaceEventSettings(aggregate: EventAggregate, settings: EventSettings, now: string) {
  failUnless(aggregate.lifecycle.status === "PLANNED", "INVALID_STATE", "Settings are editable only while planned.");
  failUnless(aggregate.participants.length === 0, "INVALID_STATE", "Settings cannot change after applications exist.");
  return updated(aggregate, now, { settings: validateSettings(settings) });
}

export function setEventMediaGallery(
  aggregate: EventAggregate,
  galleryId: string | null,
  now: string,
) {
  failUnless(
    aggregate.lifecycle.status === "IN_PROGRESS" || aggregate.lifecycle.status === "COMPLETED",
    "INVALID_STATE",
    "A result gallery may be linked during or after the event.",
  );
  if (galleryId !== null) canonicalIdentifier(galleryId, "galleryId");
  return updated(aggregate, now, { galleryId });
}

export function startEventRecruitment(aggregate: EventAggregate, now: string) {
  try {
    return updated(aggregate, now, {
      lifecycle: transitionEventLifecycle(aggregate.lifecycle, { type: "START_RECRUITMENT" }),
    });
  } catch (error) {
    throw lifecycleError(error);
  }
}

export function closeEventRecruitment(aggregate: EventAggregate, now: string) {
  const activeCount = aggregate.participants.filter((participant) => participant.status === "ACTIVE").length;
  failUnless(activeCount === 10, "PRECONDITION_FAILED", "Exactly ten active participants are required to close recruitment.");
  try {
    return updated(aggregate, now, {
      lifecycle: transitionEventLifecycle(aggregate.lifecycle, { type: "CLOSE_RECRUITMENT", participantsReady: true }),
    });
  } catch (error) {
    throw lifecycleError(error);
  }
}

function lifecycleError(error: unknown) {
  if (error instanceof CompetitionCoreError) {
    return new EventDomainError(error.code === "PRECONDITION_FAILED" ? "PRECONDITION_FAILED" : "INVALID_STATE", error.message);
  }
  return error;
}

function participantFromInput(
  aggregate: EventAggregate,
  input: EventParticipantInput,
  source: EventParticipant["source"],
): EventParticipant {
  canonicalIdentifier(input.id, "participantId");
  canonicalIdentifier(input.playerId, "playerId");
  if (input.ownerUserAccountId !== null && input.ownerUserAccountId !== undefined) {
    canonicalIdentifier(input.ownerUserAccountId, "ownerUserAccountId");
  }
  return Object.freeze({
    id: input.id,
    playerId: input.playerId,
    ownerUserAccountId: input.ownerUserAccountId ?? null,
    source,
    status: "ACTIVE",
    ...validatePreference(aggregate.settings.format, input),
  });
}

function ensureParticipantUnique(
  participants: readonly EventParticipant[],
  participant: EventParticipant,
) {
  failUnless(
    !participants.some((entry) => entry.id === participant.id || entry.playerId === participant.playerId),
    "DUPLICATE_PARTICIPANT",
    "Participant or player already exists in this event.",
  );
  if (participant.ownerUserAccountId) {
    failUnless(
      !participants.some((entry) => entry.ownerUserAccountId === participant.ownerUserAccountId),
      "DUPLICATE_PARTICIPANT",
      "An account can own only one event application.",
    );
  }
}

export function upsertOwnEventApplication(
  aggregate: EventAggregate,
  input: EventParticipantInput & Readonly<{ ownerUserAccountId: string }>,
  now: string,
) {
  editableParticipants(aggregate, false, now);
  canonicalIdentifier(input.ownerUserAccountId, "ownerUserAccountId");
  const current = aggregate.participants.find((participant) => participant.ownerUserAccountId === input.ownerUserAccountId);
  if (!current) {
    const participant = participantFromInput(aggregate, input, "USER_APPLICATION");
    ensureParticipantUnique(aggregate.participants, participant);
    return updated(aggregate, now, { participants: Object.freeze([...aggregate.participants, participant]) });
  }
  failUnless(current.playerId === input.playerId, "INVALID_INPUT", "An application cannot be moved to another player.");
  failUnless(current.id === input.id, "INVALID_INPUT", "Application updates must retain their participant identifier.");
  const preference = validatePreference(aggregate.settings.format, input);
  return updated(aggregate, now, {
    participants: Object.freeze(aggregate.participants.map((participant) =>
      participant.id === current.id
        ? Object.freeze({ ...participant, ...preference, status: "ACTIVE" as const })
        : participant,
    )),
  });
}

export function cancelOwnEventApplication(
  aggregate: EventAggregate,
  ownerUserAccountId: string,
  now: string,
) {
  editableParticipants(aggregate, false, now);
  canonicalIdentifier(ownerUserAccountId, "ownerUserAccountId");
  const current = aggregate.participants.find((participant) => participant.ownerUserAccountId === ownerUserAccountId);
  failUnless(current?.status === "ACTIVE", "NOT_FOUND", "An active owned application does not exist.");
  return updated(aggregate, now, {
    participants: Object.freeze(aggregate.participants.map((participant) =>
      participant.id === current.id ? Object.freeze({ ...participant, status: "CANCELLED" as const }) : participant,
    )),
  });
}

export function addAdminEventParticipants(
  aggregate: EventAggregate,
  inputs: readonly EventParticipantInput[],
  source: "ADMIN_IMPORT" | "ADMIN_MANUAL",
  now: string,
) {
  editableParticipants(aggregate, true, now);
  failUnless(inputs.length >= 1 && inputs.length <= 160, "INVALID_INPUT", "Participant batches contain between 1 and 160 entries.");
  const participants = [...aggregate.participants];
  for (const input of inputs) {
    const participant = participantFromInput(aggregate, input, source);
    ensureParticipantUnique(participants, participant);
    participants.push(participant);
  }
  return updated(aggregate, now, { participants: Object.freeze(participants) });
}

function allPositionEligibility(preference: EventPositionPreference, format: EventFormat) {
  const positions = ["TOP", "JGL", "MID", "ADC", "SUP"] as const;
  if (format === "ARAM") return positions.map((position) => ({ position, preference: "AUTO" as const }));
  return positions.map((position) => ({
    position,
    preference: position === preference.mainPosition
      ? "MAIN" as const
      : preference.subPositions.includes(position)
        ? "SUB" as const
        : "AUTO" as const,
  }));
}

export function eventTeamBalanceParticipants(aggregate: EventAggregate): readonly EventTeamBalanceParticipant[] {
  failUnless(aggregate.lifecycle.status === "TEAM_BUILDING", "INVALID_STATE", "Teams are built during TEAM_BUILDING.");
  failUnless(aggregate.teams.length === 0 && aggregate.bracket === null, "INVALID_STATE", "Teams are already built.");
  const active = aggregate.participants
    .filter((participant) => participant.status === "ACTIVE")
    .sort((left, right) => compareCanonicalIdentifiers(left.playerId, right.playerId));
  failUnless(active.length === 10, "PRECONDITION_FAILED", "S06 team balance requires exactly ten active participants.");
  return Object.freeze(active.map((participant) => Object.freeze({
    participantId: participant.id,
    playerId: participant.playerId,
    eligiblePositions: Object.freeze(allPositionEligibility(participant, aggregate.settings.format)),
  })));
}

export function applyEventTeamBalance(
  aggregate: EventAggregate,
  calculation: TeamBalanceCalculation,
  now: string,
) {
  const requested = eventTeamBalanceParticipants(aggregate);
  const candidate = calculation.candidates[0];
  failUnless(candidate, "PRECONDITION_FAILED", "Team balance did not return a candidate.");
  const participantByPlayerId = new Map(
    aggregate.participants.filter((participant) => participant.status === "ACTIVE").map((participant) => [participant.playerId, participant]),
  );
  failUnless(candidate.assignments.length === requested.length, "PRECONDITION_FAILED", "Team balance candidate does not cover every participant.");
  const assigned = new Set<string>();
  const teams = (["BLUE", "RED"] as const).map((side) => {
    const assignments = candidate.assignments.filter((assignment) => assignment.team === side);
    failUnless(assignments.length === 5, "PRECONDITION_FAILED", "Each balanced team must contain five members.");
    const members = assignments.map((assignment) => {
      const participant = participantByPlayerId.get(assignment.playerId);
      failUnless(participant && !assigned.has(participant.id), "PRECONDITION_FAILED", "Team balance contains an unknown or duplicate player.");
      assigned.add(participant.id);
      return Object.freeze({
        participantId: participant.id,
        position: aggregate.settings.format === "POSITION" ? assignment.position : null,
      });
    });
    validateEventRoster({
      format: aggregate.settings.format === "POSITION" ? "POSITIONAL" : "ARAM",
      members: members.map((member) => {
        const participant = aggregate.participants.find((entry) => entry.id === member.participantId)!;
        return { participantId: participant.id, playerId: participant.playerId, position: member.position };
      }),
    });
    const balanceScore = side === "BLUE"
      ? candidate.score.teamStrength.blueTotal
      : candidate.score.teamStrength.redTotal;
    failUnless(Number.isFinite(balanceScore), "PRECONDITION_FAILED", "Team balance scores must be finite.");
    return Object.freeze({
      id: `${aggregate.id}:TEAM:${side}`,
      name: side,
      seed: null,
      balanceScore,
      members: Object.freeze(members),
    });
  });
  failUnless(assigned.size === requested.length, "PRECONDITION_FAILED", "Team balance must assign every participant exactly once.");
  return updated(aggregate, now, { teams: Object.freeze(teams) });
}

export function generateEventBracket(aggregate: EventAggregate, now: string) {
  failUnless(aggregate.lifecycle.status === "TEAM_BUILDING", "INVALID_STATE", "A bracket is generated during TEAM_BUILDING.");
  failUnless(aggregate.teams.length >= 2 && aggregate.bracket === null, "PRECONDITION_FAILED", "At least two built teams and no prior bracket are required.");
  const activeParticipantById = new Map(
    aggregate.participants
      .filter((participant) => participant.status === "ACTIVE")
      .map((participant) => [participant.id, participant]),
  );
  const assignedParticipantIds = new Set<string>();
  const teamIds = new Set<string>();
  for (const team of aggregate.teams) {
    canonicalIdentifier(team.id, "teamId");
    failUnless(!teamIds.has(team.id), "PRECONDITION_FAILED", "Built team IDs must be unique.");
    failUnless(Number.isFinite(team.balanceScore), "PRECONDITION_FAILED", "Built team scores must be finite.");
    teamIds.add(team.id);
    validateEventRoster({
      format: aggregate.settings.format === "POSITION" ? "POSITIONAL" : "ARAM",
      members: team.members.map((member) => {
        const participant = activeParticipantById.get(member.participantId);
        failUnless(participant && !assignedParticipantIds.has(participant.id), "PRECONDITION_FAILED", "Built teams contain an unknown or duplicate participant.");
        assignedParticipantIds.add(participant.id);
        return {
          participantId: participant.id,
          playerId: participant.playerId,
          position: member.position,
        };
      }),
    });
  }
  failUnless(
    assignedParticipantIds.size === activeParticipantById.size,
    "PRECONDITION_FAILED",
    "Built teams must cover every active participant exactly once.",
  );
  const ordered = [...aggregate.teams].sort((left, right) =>
    right.balanceScore - left.balanceScore || compareCanonicalIdentifiers(left.id, right.id),
  );
  let bracket: SingleEliminationBracket;
  try {
    bracket = buildSingleEliminationBracket({
      competitionId: aggregate.id,
      teams: ordered.map((team, index) => ({ id: team.id, seed: index + 1 })),
      bestOf: aggregate.settings.bracketBestOf,
    });
  } catch (error) {
    throw new EventDomainError(
      "PRECONDITION_FAILED",
      error instanceof Error ? error.message : "Event bracket is invalid.",
    );
  }
  let lifecycle: EventLifecycle;
  try {
    lifecycle = transitionEventLifecycle(aggregate.lifecycle, {
      type: "PUBLISH_BRACKET",
      rostersValid: true,
      bracketReady: true,
    });
  } catch (error) {
    throw lifecycleError(error);
  }
  const seedByTeamId = new Map(bracket.teams.map((team) => [team.id, team.seed]));
  return updated(aggregate, now, {
    lifecycle,
    bracket,
    teams: Object.freeze(aggregate.teams.map((team) => Object.freeze({ ...team, seed: seedByTeamId.get(team.id)! }))),
  });
}

export function recordEventFixtureResult(
  aggregate: EventAggregate,
  input: Readonly<{ fixtureId: string; teamAScore: number; teamBScore: number; winnerTeamId: string }>,
  now: string,
) {
  failUnless(aggregate.lifecycle.status === "IN_PROGRESS" && aggregate.bracket, "INVALID_STATE", "Results are recorded only for an event in progress.");
  try {
    const advanced = advanceSingleEliminationBracket(aggregate.bracket, input);
    failUnless(!advanced.replayed, "INVALID_RESULT", "Use idempotency replay rather than recording the same result twice.");
    return updated(aggregate, now, { bracket: advanced.bracket });
  } catch (error) {
    if (error instanceof EventDomainError) throw error;
    throw new EventDomainError("INVALID_RESULT", error instanceof Error ? error.message : "Fixture result is invalid.");
  }
}

function downstreamFixtureIds(bracket: SingleEliminationBracket, fixtureId: string) {
  const downstream = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const fixture of bracket.fixtures) {
      const sourceIds = [fixture.sourceA, fixture.sourceB].flatMap((source) =>
        source.kind === "WINNER" ? [source.sourceFixtureId] : [],
      );
      if (sourceIds.some((sourceId) => sourceId === fixtureId || downstream.has(sourceId)) && !downstream.has(fixture.id)) {
        downstream.add(fixture.id);
        changed = true;
      }
    }
  }
  return downstream;
}

export function correctEventFixtureResult(
  aggregate: EventAggregate,
  input: Readonly<{ fixtureId: string; teamAScore: number; teamBScore: number; winnerTeamId: string }>,
  now: string,
): Readonly<{ aggregate: EventAggregate; plan: EventResultCorrectionPlan }> {
  failUnless(aggregate.lifecycle.status === "IN_PROGRESS" && aggregate.bracket, "INVALID_STATE", "Results are corrected only before event completion.");
  const original = aggregate.bracket.fixtures.find((fixture) => fixture.id === input.fixtureId);
  failUnless(original?.result, "NOT_FOUND", "Only a completed fixture result can be corrected.");
  failUnless(
    original.result.teamAScore !== input.teamAScore ||
      original.result.teamBScore !== input.teamBScore ||
      original.result.winnerTeamId !== input.winnerTeamId,
    "INVALID_RESULT",
    "A correction must change the stored result.",
  );
  const downstream = original.result.winnerTeamId === input.winnerTeamId
    ? new Set<string>()
    : downstreamFixtureIds(aggregate.bracket, input.fixtureId);
  let rebuilt = buildSingleEliminationBracket({
    competitionId: aggregate.id,
    teams: aggregate.teams.map((team) => ({ id: team.id, seed: team.seed! })),
    bestOf: aggregate.settings.bracketBestOf,
  });
  try {
    for (const fixture of aggregate.bracket.fixtures) {
      if (fixture.id === input.fixtureId) {
        rebuilt = advanceSingleEliminationBracket(rebuilt, input).bracket;
      } else if (fixture.result && !downstream.has(fixture.id)) {
        rebuilt = advanceSingleEliminationBracket(rebuilt, {
          fixtureId: fixture.id,
          teamAScore: fixture.result.teamAScore,
          teamBScore: fixture.result.teamBScore,
          winnerTeamId: fixture.result.winnerTeamId,
        }).bracket;
      }
    }
  } catch (error) {
    throw new EventDomainError("INVALID_RESULT", error instanceof Error ? error.message : "Corrected bracket is invalid.");
  }
  const plan: EventResultCorrectionPlan = Object.freeze({
    correctedFixtureId: input.fixtureId,
    downstreamFixtureIds: Object.freeze([...downstream]),
    invalidatedResultFixtureIds: Object.freeze(aggregate.bracket.fixtures.filter((fixture) => downstream.has(fixture.id) && fixture.result).map((fixture) => fixture.id)),
    previousWinnerTeamId: original.result.winnerTeamId,
    nextWinnerTeamId: input.winnerTeamId,
  });
  return { aggregate: updated(aggregate, now, { bracket: rebuilt }), plan };
}

export function completeEvent(
  aggregate: EventAggregate,
  mvpParticipantId: string | null,
  now: string,
) {
  failUnless(aggregate.lifecycle.status === "IN_PROGRESS" && aggregate.bracket?.championTeamId, "PRECONDITION_FAILED", "A final result is required before completion.");
  if (mvpParticipantId !== null) {
    canonicalIdentifier(mvpParticipantId, "mvpParticipantId");
    failUnless(
      aggregate.participants.some((participant) => participant.id === mvpParticipantId && participant.status === "ACTIVE"),
      "INVALID_INPUT",
      "MVP must be an active event participant.",
    );
  }
  try {
    return updated(aggregate, now, {
      lifecycle: transitionEventLifecycle(aggregate.lifecycle, { type: "COMPLETE", finalResultConfirmed: true }),
      winnerTeamId: aggregate.bracket.championTeamId,
      mvpParticipantId,
    });
  } catch (error) {
    throw lifecycleError(error);
  }
}

export function cancelEvent(aggregate: EventAggregate, reason: string, now: string) {
  try {
    return updated(aggregate, now, {
      lifecycle: transitionEventLifecycle(aggregate.lifecycle, { type: "CANCEL", reason }),
    });
  } catch (error) {
    throw lifecycleError(error);
  }
}

export function restoreCancelledEvent(aggregate: EventAggregate, now: string) {
  try {
    return updated(aggregate, now, {
      lifecycle: transitionEventLifecycle(aggregate.lifecycle, { type: "RESTORE_CANCELLED" }),
    });
  } catch (error) {
    throw lifecycleError(error);
  }
}
