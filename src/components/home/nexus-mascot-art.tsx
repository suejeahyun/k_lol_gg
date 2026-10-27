import Image from "next/image";
import type { CSSProperties } from "react";

import styles from "./nexus-home.module.css";

/** The original board stays intact; each window reveals one part with CSS. */
export function NexusMascotArt({
  crop,
  alt,
  className = "",
  preload = false,
}: Readonly<{
  crop: readonly [x: number, y: number, width: number, height: number];
  alt: string;
  className?: string;
  preload?: boolean;
}>) {
  const [x, y, width, height] = crop;
  const imageStyle: CSSProperties = {
    width: `${1254 / width * 100}%`,
    maxWidth: "none",
    height: "auto",
    left: `${-x / width * 100}%`,
    top: `${-y / height * 100}%`,
  };

  return (
    <span className={`${styles.crop} ${className}`} style={{ aspectRatio: `${width} / ${height}` }}>
      <Image
        src="/images/nexus/mascot-board.png"
        alt={alt}
        width={1254}
        height={1254}
        sizes="1254px"
        quality={75}
        preload={preload}
        loading={preload ? undefined : "lazy"}
        style={imageStyle}
      />
    </span>
  );
}
