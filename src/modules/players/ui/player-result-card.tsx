import { Gamepad2, Hash, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PlayerSummary } from "../domain/player";

const positionLabels: Record<PlayerSummary["mainPosition"], string> = {
  TOP: "탑",
  JUNGLE: "정글",
  MID: "미드",
  ADC: "원거리 딜러",
  SUPPORT: "서포터",
};

export function PlayerResultCard({ player }: { player: PlayerSummary }) {
  return (
    <Card className="player-card">
      <CardHeader>
        <div className="player-card__identity">
          <span aria-hidden="true">{player.displayName.slice(0, 1)}</span>
          <div>
            <CardTitle>{player.displayName}</CardTitle>
            <small>
              <Hash size={12} /> {player.riotId}
            </small>
          </div>
        </div>
        <Badge variant="secondary">{positionLabels[player.mainPosition]}</Badge>
      </CardHeader>
      <CardContent className="player-card__stats">
        <div>
          <Gamepad2 size={16} />
          <span>최근 내전</span>
          <strong>{player.recentMatches}회</strong>
        </div>
        <div>
          <TrendingUp size={16} />
          <span>승률</span>
          <strong>{player.winRate}%</strong>
        </div>
        <div>
          <span>솔로 랭크</span>
          <strong>{player.tier}</strong>
        </div>
      </CardContent>
    </Card>
  );
}
