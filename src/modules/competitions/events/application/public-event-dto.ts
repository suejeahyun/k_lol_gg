import { competitionPlayerLabel, competitionTeamLabel } from "../../core";
import type { PublicGalleryDto } from "@/modules/media";
import { eventAcceptsApplications, type EventAggregate } from "../domain/event";

export type PublicEventDto = Readonly<{
  id: string;
  revision: number;
  title: string;
  description: string | null;
  status: EventAggregate["lifecycle"]["status"];
  format: EventAggregate["settings"]["format"];
  recruitmentOpensAt: string;
  recruitmentClosesAt: string;
  applicationsOpen: boolean;
  participantCount: number;
  gallery: PublicGalleryDto | null;
  teams: readonly Readonly<{
    id: string;
    name: string;
    seed: number | null;
    members: readonly Readonly<{
      participantId: string;
      playerId: string;
      playerName: string;
      position: string | null;
    }>[];
  }>[];
  fixtures: readonly Readonly<{
    id: string;
    stage: string;
    roundNumber: number;
    slotNumber: number;
    bestOf: number;
    sourceFixtureIdA: string | null;
    sourceFixtureIdB: string | null;
    teamAId: string | null;
    teamBId: string | null;
    teamAName: string;
    teamBName: string;
    teamAScore: number | null;
    teamBScore: number | null;
    winnerTeamId: string | null;
  }>[];
  winnerTeamId: string | null;
  winnerTeamName: string | null;
  mvpPlayerId: string | null;
  mvpPlayerName: string | null;
}>;

export type OwnEventApplicationDto = Readonly<{
  eventId: string;
  participantId: string;
  playerId: string;
  mainPosition: string | null;
  subPositions: readonly string[];
  status: "ACTIVE" | "CANCELLED";
  eventRevision: number;
}>;

export function toPublicEventDto(
  aggregate: EventAggregate,
  now: string,
  playerCatalog: ReadonlyMap<string, string> = new Map(),
  gallery: PublicGalleryDto | null = null,
): PublicEventDto {
  const participantById = new Map(aggregate.participants.map((participant) => [participant.id, participant]));
  return {
    id: aggregate.id,
    revision: aggregate.revision,
    title: aggregate.settings.title,
    description: aggregate.settings.description,
    status: aggregate.lifecycle.status,
    format: aggregate.settings.format,
    recruitmentOpensAt: aggregate.settings.recruitmentOpensAt,
    recruitmentClosesAt: aggregate.settings.recruitmentClosesAt,
    applicationsOpen: eventAcceptsApplications(aggregate, now),
    participantCount: aggregate.participants.filter((participant) => participant.status === "ACTIVE").length,
    gallery,
    teams: aggregate.teams.map((team) => ({
      id: team.id,
      name: team.name,
      seed: team.seed,
      members: team.members.map((member) => {
        const participant = participantById.get(member.participantId)!;
        return {
          participantId: participant.id,
          playerId: participant.playerId,
          playerName: competitionPlayerLabel(playerCatalog, participant.playerId),
          position: member.position,
        };
      }),
    })),
    fixtures: aggregate.bracket?.fixtures.map((fixture) => ({
      id: fixture.id,
      stage: fixture.stage,
      roundNumber: fixture.roundNumber,
      slotNumber: fixture.slotNumber,
      bestOf: fixture.bestOf,
      sourceFixtureIdA: fixture.sourceA.kind === "WINNER" ? fixture.sourceA.sourceFixtureId : null,
      sourceFixtureIdB: fixture.sourceB.kind === "WINNER" ? fixture.sourceB.sourceFixtureId : null,
      teamAId: fixture.teamAId,
      teamBId: fixture.teamBId,
      teamAName: competitionTeamLabel(aggregate.teams, fixture.teamAId),
      teamBName: competitionTeamLabel(aggregate.teams, fixture.teamBId),
      teamAScore: fixture.result?.teamAScore ?? null,
      teamBScore: fixture.result?.teamBScore ?? null,
      winnerTeamId: fixture.winnerTeamId,
    })) ?? [],
    winnerTeamId: aggregate.winnerTeamId,
    winnerTeamName: aggregate.winnerTeamId === null ? null : competitionTeamLabel(aggregate.teams, aggregate.winnerTeamId),
    mvpPlayerId: aggregate.mvpParticipantId === null
      ? null
      : participantById.get(aggregate.mvpParticipantId)?.playerId ?? null,
    mvpPlayerName: aggregate.mvpParticipantId === null
      ? null
      : competitionPlayerLabel(playerCatalog, participantById.get(aggregate.mvpParticipantId)?.playerId ?? ""),
  };
}

export function toOwnEventApplicationDto(
  aggregate: EventAggregate,
  ownerUserAccountId: string,
): OwnEventApplicationDto | null {
  const participant = aggregate.participants.find((entry) => entry.ownerUserAccountId === ownerUserAccountId);
  return participant ? {
    eventId: aggregate.id,
    participantId: participant.id,
    playerId: participant.playerId,
    mainPosition: participant.mainPosition,
    subPositions: participant.subPositions,
    status: participant.status,
    eventRevision: aggregate.revision,
  } : null;
}
