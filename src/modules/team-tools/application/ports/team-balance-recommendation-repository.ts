import type { TeamBalanceTeam } from "../../domain/team-balance";
import type { TeamBalanceRecommendationDto } from "../../domain/team-recommendations";
import type { TeamBalanceViewer } from "./team-balance-repository";

export interface TeamBalanceRecommendationRepository {
  getRecommendation(
    viewer: TeamBalanceViewer,
    draftId: string,
    team: TeamBalanceTeam,
  ): Promise<TeamBalanceRecommendationDto | null>;
}
