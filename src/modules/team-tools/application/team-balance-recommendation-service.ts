import { TEAM_BALANCE_TEAMS, type TeamBalanceTeam } from "../domain/team-balance";
import { TeamBalanceServiceError } from "../domain/team-balance-draft";
import type { TeamBalanceRecommendationRepository } from "./ports/team-balance-recommendation-repository";
import type { TeamBalanceViewer } from "./ports/team-balance-repository";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export class TeamBalanceRecommendationService {
  constructor(private readonly repository: TeamBalanceRecommendationRepository) {}

  getRecommendation(viewer: TeamBalanceViewer, draftId: string, team: string) {
    if (!UUID.test(draftId) || !TEAM_BALANCE_TEAMS.includes(team as TeamBalanceTeam)) {
      throw new TeamBalanceServiceError("INVALID_INPUT", "추천 초안 또는 팀 값이 올바르지 않습니다.");
    }
    return this.repository.getRecommendation(viewer, draftId.toLowerCase(), team as TeamBalanceTeam);
  }
}
