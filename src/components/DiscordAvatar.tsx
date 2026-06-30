"use client";

import { useState } from "react";

type DiscordAvatarProps = {
  src?: string | null;
  name?: string | null;
  alt?: string;
  className?: string;
  placeholderClassName?: string;
};

function getInitial(name?: string | null) {
  const normalized = String(name || "").trim();
  return normalized ? normalized.slice(0, 1).toUpperCase() : "D";
}

export default function DiscordAvatar({
  src,
  name,
  alt = "Discord avatar",
  className,
  placeholderClassName = "discord-avatar-placeholder",
}: DiscordAvatarProps) {
  const [failed, setFailed] = useState(false);
  const safeSrc = typeof src === "string" && /^https:\/\//i.test(src) ? src : null;

  if (safeSrc && !failed) {
    return (
      <img
        src={safeSrc}
        alt={alt}
        className={className}
        referrerPolicy="no-referrer"
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  }

  return <div className={placeholderClassName}>{getInitial(name)}</div>;
}
