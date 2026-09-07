import { toPublicRecruitPartyDto, type RecruitParty, type ScrimRecruit } from "../domain/recruiting";

export type PublicScrimRecruitDto = Readonly<{
  id: string;
  recruitDate: string;
  scrimNumber: number;
  tournamentId: string;
  requesterTeamId: string | null;
  opponentTeamId: string | null;
  title: string | null;
  requesterTeamName: string | null;
  opponentTeamName: string | null;
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
    requesterTeamId: scrim.requesterTeamId,
    opponentTeamId: scrim.opponentTeamId,
    title: scrim.legacyTitle ?? null,
    requesterTeamName: scrim.requesterTeamName ?? null,
    opponentTeamName: scrim.opponentTeamName ?? null,
    status: scrim.status,
    scheduledAt: scrim.scheduledAt?.toISOString() ?? null,
    bestOf: scrim.bestOf,
  });
}
