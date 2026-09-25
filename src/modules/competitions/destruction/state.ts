import { destructionAuctionCard } from "./auction-presentation";
import { aramAuctionRating } from "./aram-rating";
import {
  competitionPlayerLabel,
  competitionTeamLabel,
  transitionDestructionLifecycle,
  type DestructionLifecycle,
  type DestructionStatus,
  type SingleEliminationBracket,
  type StandingsFixture,
} from "../core";
import { canonicalIdentifier, requireCompetition } from "../core/error";
import type { DestructionConfiguration } from "./configuration";
import type { DestructionMvpBallot } from "./mvp-voting";
import type { DestructionApplication } from "./recruitment";
import type { DestructionFixtureRosterSnapshot, DestructionReplacement } from "./roster-history";
import type { DestructionParticipant, DestructionTeam } from "./teams";
import { destructionRecruitment, destructionStandings } from "./workflow";
import { EMPTY_DESTRUCTION_SCHEDULE, type DestructionSchedule } from "./schedule";

export type DestructionAggregate = Readonly<{
  id: string;
  revision: number;
  title: string;
  lifecycle: DestructionLifecycle;
  configuration: DestructionConfiguration;
  applications: readonly DestructionApplication[];
  teams: readonly DestructionTeam[];
  participants: readonly DestructionParticipant[];
  auctionSeed: string | null;
  /** Older stored snapshots without this field are running, not paused. */
  auctionPaused?: boolean;
  schedule?: DestructionSchedule;
  preliminaryFixtures: readonly StandingsFixture[];
  qualifiedTeamIds: readonly string[];
  tournamentBracket: SingleEliminationBracket | null;
  rosterSnapshots: readonly DestructionFixtureRosterSnapshot[];
  replacements: readonly DestructionReplacement[];
  mvpBallots: readonly DestructionMvpBallot[];
  galleryId: string | null;
  createdAt: string;
  updatedAt: string;
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
  captainPlayerId: string | null;
  captainPlayerName: string | null;
  initialAuctionPoints: number;
  remainingAuctionPoints: number;
  rosterPlayers: readonly Readonly<{
    participantId: string;
    playerId: string;
    playerName: string;
    position: string | null;
    isCaptain: boolean;
    auctionStatus: string;
    purchasePoints: number | null;
  }>[];
}>;

export type DestructionPublicGalleryDto = Readonly<{
  id: string;
  title: string;
  description: string;
  images: readonly Readonly<{ assetId: string; ordinal: number; url: string }>[];
}>;

export type DestructionPublicFixtureDto = Readonly<{
  id: string;
  groupKey: string | null;
  status: "PENDING" | "COMPLETED" | "VOIDED";
  confirmed: boolean;
  bestOf: number;
  teamAId: string;
  teamBId: string;
  teamAName: string;
  teamBName: string;
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
  teamCount: number;
  gameMode: import("./aram-rating").DestructionGameMode;
  auctionRatings: readonly Readonly<{ playerName: string; tier: string; games: number; wins: number; losses: number; minimumBid: number; captainPoints: number; provisional: boolean; source: string; fetchedAt: string }>[];
  unassignedPlayers: readonly Readonly<{ participantId: string; playerId: string; playerName: string; position: string | null; teamName: string; isCaptain: boolean; purchasePoints: number | null }>[];
  schedule: DestructionSchedule;
  recruitment: ReturnType<typeof destructionRecruitment>;
  standings: ReturnType<typeof destructionStandings>;
  auction: Readonly<{
    paused: boolean;
    pendingCount: number;
    soldCount: number;
    drawnPlayerName: string | null;
    drawnPosition: string | null;
    card: ReturnType<typeof destructionAuctionCard>;
  }>;
  teams: readonly DestructionPublicTeamDto[];
  preliminaryFixtures: readonly DestructionPublicFixtureDto[];
  tournamentFixtures: readonly Readonly<{
    id: string;
    stage: "ROUND_OF_32" | "ROUND_OF_16" | "QUARTER_FINAL" | "SEMI_FINAL" | "FINAL";
    bestOf: number;
    teamAId: string | null;
    teamBId: string | null;
    teamAName: string;
    teamBName: string;
    teamAScore: number | null;
    teamBScore: number | null;
    winnerTeamId: string | null;
  }>[];
  qualifiedTeamIds: readonly string[];
  championTeamId: string | null;
  championTeamName: string | null;
  gallery: DestructionPublicGalleryDto | null;
  mvpResults: readonly Readonly<{ fixtureId: string; fixtureName: string; finalizedPlayerId: string; finalizedPlayerName: string; selectionMethod: "VOTE" | "ADMIN" }>[];
}>;

export function toDestructionPublicDto(
  aggregate: DestructionAggregate,
  playerCatalog: ReadonlyMap<string, string> = new Map(),
  gallery: DestructionPublicGalleryDto | null = null,
): DestructionPublicDto {
  const fixtureName = (fixtureId: string) => {
    const preliminary = aggregate.preliminaryFixtures.find((fixture) => fixture.id === fixtureId);
    const tournament = aggregate.tournamentBracket?.fixtures.find((fixture) => fixture.id === fixtureId);
    const teamAId = preliminary?.teamAId ?? tournament?.teamAId ?? null;
    const teamBId = preliminary?.teamBId ?? tournament?.teamBId ?? null;
    return `${competitionTeamLabel(aggregate.teams, teamAId)} vs ${competitionTeamLabel(aggregate.teams, teamBId)}`;
  };
  return Object.freeze({
    id: aggregate.id,
    revision: aggregate.revision,
    title: aggregate.title,
    status: aggregate.lifecycle.status,
    preliminaryFormat: aggregate.configuration.preliminaryFormat,
    preliminaryBestOf: aggregate.configuration.preliminaryBestOf,
    preliminaryRoundCount: aggregate.configuration.preliminaryRoundCount,
    advanceTeamCount: aggregate.configuration.advanceTeamCount,
    teamCount: aggregate.configuration.teamCount,
    gameMode: aggregate.configuration.gameMode ?? "CLASSIC",
    auctionRatings: aggregate.participants.flatMap((p) => p.aramRecord ? [{ playerName: competitionPlayerLabel(playerCatalog, p.playerId), ...aramAuctionRating(p.aramRecord), source: p.aramRecord.source, fetchedAt: p.aramRecord.fetchedAt }] : []),
    schedule: aggregate.schedule ?? EMPTY_DESTRUCTION_SCHEDULE,
    unassignedPlayers: aggregate.participants.filter((entry) => entry.teamId === null).map((entry) => ({ participantId: entry.id, playerId: entry.playerId, playerName: competitionPlayerLabel(playerCatalog, entry.playerId), position: entry.position, teamName: "팀 배정 대기", isCaptain: entry.isCaptain, purchasePoints: entry.purchasePoints })),
    recruitment: destructionRecruitment(aggregate),
    standings: destructionStandings(aggregate),
    auction: {
      card: destructionAuctionCard(aggregate, (id) => competitionPlayerLabel(playerCatalog, id)),
      paused: aggregate.auctionPaused ?? false,
      pendingCount: aggregate.participants.filter((entry) => ["PENDING", "HOLD", "DRAWN"].includes(entry.auctionStatus)).length,
      soldCount: aggregate.participants.filter((entry) => entry.auctionStatus === "SOLD").length,
      drawnPlayerName: (() => { const drawn = aggregate.participants.find((entry) => entry.auctionStatus === "DRAWN"); return drawn ? competitionPlayerLabel(playerCatalog, drawn.playerId) : null; })(),
      drawnPosition: aggregate.participants.find((entry) => entry.auctionStatus === "DRAWN")?.position ?? null,
    },
    teams: Object.freeze([...aggregate.teams].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0).map((team) => {
      const captain = aggregate.participants.find((participant) => participant.id === team.captainParticipantId) ?? null;
      return Object.freeze({
        id: team.id,
        name: team.name,
        confirmed: team.confirmed,
        captainPlayerId: captain?.playerId ?? null,
        captainPlayerName: captain ? competitionPlayerLabel(playerCatalog, captain.playerId) : null,
        initialAuctionPoints: team.initialAuctionPoints,
        remainingAuctionPoints: team.remainingAuctionPoints,
        rosterPlayerIds: Object.freeze(aggregate.participants.filter((participant) => participant.teamId === team.id).map((participant) => participant.playerId).sort()),
        rosterPlayers: Object.freeze(aggregate.participants.filter((participant) => participant.teamId === team.id).map((participant) => Object.freeze({
          participantId: participant.id,
          playerId: participant.playerId,
          playerName: competitionPlayerLabel(playerCatalog, participant.playerId),
          position: participant.position,
          isCaptain: participant.isCaptain,
          auctionStatus: participant.auctionStatus,
          purchasePoints: participant.purchasePoints,
        })).sort((left, right) => (left.position ?? "").localeCompare(right.position ?? "", "en-US") || left.playerName.localeCompare(right.playerName, "ko-KR"))),
      });
    })),
    preliminaryFixtures: Object.freeze([...aggregate.preliminaryFixtures].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0).map((fixture) => Object.freeze({
      id: fixture.id,
      groupKey: fixture.groupKey,
      status: fixture.status,
      confirmed: fixture.confirmed,
      bestOf: fixture.bestOf,
      teamAId: fixture.teamAId,
      teamBId: fixture.teamBId,
      teamAName: competitionTeamLabel(aggregate.teams, fixture.teamAId),
      teamBName: competitionTeamLabel(aggregate.teams, fixture.teamBId),
      teamAScore: fixture.teamAScore,
      teamBScore: fixture.teamBScore,
      winnerTeamId: fixture.winnerTeamId,
    }))),
    tournamentFixtures: Object.freeze((aggregate.tournamentBracket?.fixtures ?? []).map((fixture) => Object.freeze({
      id: fixture.id,
      stage: fixture.stage,
      bestOf: fixture.bestOf,
      teamAId: fixture.teamAId,
      teamBId: fixture.teamBId,
      teamAName: competitionTeamLabel(aggregate.teams, fixture.teamAId),
      teamBName: competitionTeamLabel(aggregate.teams, fixture.teamBId),
      teamAScore: fixture.result?.teamAScore ?? null,
      teamBScore: fixture.result?.teamBScore ?? null,
      winnerTeamId: fixture.winnerTeamId,
    }))),
    qualifiedTeamIds: Object.freeze([...aggregate.qualifiedTeamIds]),
    championTeamId: aggregate.tournamentBracket?.championTeamId ?? null,
    championTeamName: aggregate.tournamentBracket?.championTeamId
      ? competitionTeamLabel(aggregate.teams, aggregate.tournamentBracket.championTeamId)
      : null,
    gallery,
    mvpResults: Object.freeze(aggregate.mvpBallots
      .filter((ballot): ballot is typeof ballot & { finalizedPlayerId: string; selectionMethod: "VOTE" | "ADMIN" } => ballot.finalizedPlayerId !== null && ballot.selectionMethod !== null)
      .map((ballot) => Object.freeze({
        fixtureId: ballot.fixtureId,
        fixtureName: fixtureName(ballot.fixtureId),
        finalizedPlayerId: ballot.finalizedPlayerId,
        finalizedPlayerName: competitionPlayerLabel(playerCatalog, ballot.finalizedPlayerId),
        selectionMethod: ballot.selectionMethod,
      }))
      .sort((left, right) => left.fixtureId < right.fixtureId ? -1 : left.fixtureId > right.fixtureId ? 1 : 0)),
  });
}
