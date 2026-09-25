import { competitionPositionLabel } from "../core/display-projection";
import { aramAuctionRating } from "./aram-rating";
import type { DestructionAggregate } from "./state";

export function destructionAuctionCard(aggregate: Pick<DestructionAggregate, "participants" | "teams"> & Partial<Pick<DestructionAggregate, "configuration">>, playerName: (id: string) => string) {
  const current = aggregate.participants.find((p) => p.auctionStatus === "DRAWN")
    ?? aggregate.participants.filter((p) => p.auctionStatus === "SOLD").sort((a, b) => (b.drawOrder ?? 0) - (a.drawOrder ?? 0))[0];
  if (!current) return null;
  const rating = current.aramRecord ? aramAuctionRating(current.aramRecord) : null;
  return {
    eventId: `${current.id}:${current.drawOrder}:${current.auctionStatus}`,
    playerName: playerName(current.playerId),
    positionLabel: (aggregate.configuration?.gameMode ?? "CLASSIC") === "CLASSIC" && current.position ? competitionPositionLabel(current.position) : "포지션 구분 없음",
    tierLabel: rating ? `대회 임시 ${rating.tier}등급 · ${rating.games}판 ${rating.wins}승 ${rating.losses}패` : "멸망전 참가 선수",
    points: current.auctionStatus === "SOLD" ? current.purchasePoints! : current.minimumBid ?? 1,
    sold: current.auctionStatus === "SOLD",
    teamName: aggregate.teams.find((t) => t.id === current.teamId)?.name,
  };
}
