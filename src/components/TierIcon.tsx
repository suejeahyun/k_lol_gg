import Image from "next/image";
import { getTierImageSrc } from "@/lib/tier";

type TierIconProps = {
  tier?: string | null;
  size?: number;
  showText?: boolean;
};

export default function TierIcon({
  tier,
  size = 28,
  showText = false,
}: TierIconProps) {
  const src = getTierImageSrc(tier);

  if (!src || !tier) {
    return showText ? <span className="tier-icon__empty">미배정</span> : null;
  }

  return (
    <span className="tier-icon">
      <Image
        src={src}
        alt={tier}
        width={size}
        height={size}
        className="tier-icon__image"
      />

      {showText && <span className="tier-icon__text">{tier}</span>}
    </span>
  );
}