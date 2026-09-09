import { toPublicRecruitPartyDto, type RecruitParty, type ScrimRecruit } from "../domain/recruiting";

export type PublicScrimRecruitDto = Readonly<{
  id: string;
  recruitDate: string;
  scrimNumber: number;
  tournamentId: string | null;
  legacyTournamentNumber: number | null;
  requesterTeamId: string | null;
  opponentTeamId: string | null;
  title: string | null;
  requesterTeamName: string | null;
  opponentTeamName: string | null;
  requesterLineup: ScrimRecruit["requesterLineup"];
  opponentLineup: ScrimRecruit["opponentLineup"];
  memo: string | null;
  seriesRuleText: string | null;
  status: ScrimRecruit["status"];
  scheduledAt: string | null;
  bestOf: number | null;
}>;

export function toPublicPartyDto(party: RecruitParty) {
  return Object.freeze({ ...toPublicRecruitPartyDto(party) });
}

export function toPublicScrimDto(scrim: ScrimRecruit): PublicScrimRecruitDto {
  return Object.freeze({
    id: scrim.id,
    recruitDate: scrim.recruitDate,
    scrimNumber: scrim.scrimNumber,
    tournamentId: scrim.tournamentId,
    legacyTournamentNumber: scrim.legacyTournamentNumber,
    requesterTeamId: scrim.requesterTeamId,
    opponentTeamId: scrim.opponentTeamId,
    title: scrim.legacyTitle ?? null,
    requesterTeamName: scrim.requesterTeamName ?? null,
    opponentTeamName: scrim.opponentTeamName ?? null,
    requesterLineup: scrim.requesterLineup,
    opponentLineup: scrim.opponentLineup,
    memo: scrim.legacyMemo,
    seriesRuleText: scrim.legacySeriesRuleText,
    status: scrim.status,
    scheduledAt: scrim.scheduledAt?.toISOString() ?? null,
    bestOf: scrim.bestOf,
  });
}
