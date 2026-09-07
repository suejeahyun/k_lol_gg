import {
  transitionDestructionLifecycle,
  type DestructionLifecycle,
  type DestructionStatus,
  type SingleEliminationBracket,
  type StandingsFixture,
} from "../core";
import { canonicalIdentifier, requireCompetition } from "../core/error";
import type { DestructionConfiguration } from "./configuration";
import type { DestructionMvpBallot } from "./mvp-voting";
import type { DestructionFixtureRosterSnapshot, DestructionReplacement } from "./roster-history";
import type { DestructionParticipant, DestructionTeam } from "./teams";

export type DestructionAggregate = Readonly<{
  id: string;
  revision: number;
  title: string;
  lifecycle: DestructionLifecycle;
  configuration: DestructionConfiguration;
  teams: readonly DestructionTeam[];
  participants: readonly DestructionParticipant[];
  preliminaryFixtures: readonly StandingsFixture[];
  qualifiedTeamIds: readonly string[];
  tournamentBracket: SingleEliminationBracket | null;
  rosterSnapshots: readonly DestructionFixtureRosterSnapshot[];
  replacements: readonly DestructionReplacement[];
  mvpBallots: readonly DestructionMvpBallot[];
}>;

export type DestructionTerminalCommand =
  | Readonly<{ type: "COMPLETE"; finalResultConfirmed: boolean }>
  | Readonly<{ type: "CANCEL"; reason: string }>
  | Readonly<{ type: "RESTORE_CANCELLED" }>;

export function applyDestructionTerminalCommand(
  aggregate: DestructionAggregate,
  command: DestructionTerminalCommand,
): DestructionAggregate {
  canonicalIdentifier(aggregate.id, "destructionId");
  requireCompetition(Number.isSafeInteger(aggregate.revision) && aggregate.revision >= 0, "PRECONDITION_FAILED", "Aggregate revisions must be non-negative safe integers.");
  if (command.type === "COMPLETE") {
    const final = aggregate.tournamentBracket?.fixtures.at(-1);
    requireCompetition(Boolean(final?.winnerTeamId), "PRECONDITION_FAILED", "The tournament bracket must have a winner before completion.");
  }
  const lifecycle = transitionDestructionLifecycle(aggregate.lifecycle, command);
  return Object.freeze({ ...aggregate, lifecycle });
}
export type DestructionPublicTeamDto = Readonly<{
  id: string;
  name: string;
  confirmed: boolean;
  rosterPlayerIds: readonly string[];
}>;

export type DestructionPublicFixtureDto = Readonly<{
  id: string;
  groupKey: string | null;
  status: "PENDING" | "COMPLETED" | "VOIDED";
  confirmed: boolean;
  bestOf: number;
  teamAId: string;
  teamBId: string;
  teamAScore: number | null;
  teamBScore: number | null;
  winnerTeamId: string | null;
}>;

export type DestructionPublicDto = Readonly<{
  id: string;
  revision: number;
  title: string;
  status: DestructionStatus;
  preliminaryFormat: string;
  preliminaryBestOf: number;
  preliminaryRoundCount: number;
  advanceTeamCount: number;
  teams: readonly DestructionPublicTeamDto[];
  preliminaryFixtures: readonly DestructionPublicFixtureDto[];
  qualifiedTeamIds: readonly string[];
  championTeamId: string | null;
}>;

export function toDestructionPublicDto(aggregate: DestructionAggregate): DestructionPublicDto {
  return Object.freeze({
    id: aggregate.id,
    revision: aggregate.revision,
    title: aggregate.title,
    status: aggregate.lifecycle.status,
    preliminaryFormat: aggregate.configuration.preliminaryFormat,
    preliminaryBestOf: aggregate.configuration.preliminaryBestOf,
    preliminaryRoundCount: aggregate.configuration.preliminaryRoundCount,
    advanceTeamCount: aggregate.configuration.advanceTeamCount,
    teams: Object.freeze([...aggregate.teams].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0).map((team) => Object.freeze({
      id: team.id,
      name: team.name,
      confirmed: team.confirmed,
      rosterPlayerIds: Object.freeze(aggregate.participants.filter((participant) => participant.teamId === team.id).map((participant) => participant.playerId).sort()),
    }))),
    preliminaryFixtures: Object.freeze([...aggregate.preliminaryFixtures].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0).map((fixture) => Object.freeze({
      id: fixture.id,
      groupKey: fixture.groupKey,
      status: fixture.status,
      confirmed: fixture.confirmed,
      bestOf: fixture.bestOf,
      teamAId: fixture.teamAId,
      teamBId: fixture.teamBId,
      teamAScore: fixture.teamAScore,
      teamBScore: fixture.teamBScore,
      winnerTeamId: fixture.winnerTeamId,
    }))),
    qualifiedTeamIds: Object.freeze([...aggregate.qualifiedTeamIds]),
    championTeamId: aggregate.tournamentBracket?.championTeamId ?? null,
  });
}
