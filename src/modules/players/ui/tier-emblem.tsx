import { playerTierFamily } from "../domain/player-tier";

export function TierEmblem({ tier }: { tier: string | null }) {
  const family = playerTierFamily(tier) ?? "UNRANKED";

  return (
    <span className="tier-emblem" data-tier={family} aria-hidden="true">
      <svg viewBox="0 0 48 48" focusable="false">
        <path className="tier-emblem__halo" d="M24 3 40 12v17L24 45 8 29V12Z" />
        <path className="tier-emblem__gem" d="m24 8 11 7-4 18-7 7-7-7-4-18Z" />
        <path className="tier-emblem__shine" d="m24 11 4 10-4 14-4-14Z" />
        <path className="tier-emblem__wing" d="m15 22-9-5 3 13 10 7M33 22l9-5-3 13-10 7" />
      </svg>
    </span>
  );
}
