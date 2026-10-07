"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";

import { ResilientMediaImage } from "@/app/(public)/(media)/resilient-media-image";
import { X } from "@/components/theme/theme-icons";

import styles from "../../events.module.css";

export function DestructionGalleryLightbox({ title, imageUrl, imageIndex }: Readonly<{
  title: string;
  imageUrl: string;
  imageIndex: number;
}>) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => closeRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      if (dialog.open) dialog.close();
      window.requestAnimationFrame(() => {
        document.getElementById(`destruction-gallery-image-${imageIndex}`)?.focus({ preventScroll: true });
      });
    };
  }, [imageIndex]);

  return <dialog ref={dialogRef} className={styles.lightbox} role="dialog" aria-modal="true" aria-labelledby="competition-image-title"
    onCancel={(event) => { event.preventDefault(); closeRef.current?.click(); }}
    onKeyDown={(event) => { if (event.key === "Tab") { event.preventDefault(); closeRef.current?.focus(); } }}>
    <div>
      <Link ref={closeRef} href="?tab=gallery" scroll={false} aria-label="이미지 닫기"><X aria-hidden="true" /></Link>
      <h2 id="competition-image-title">{title} · {imageIndex + 1}번째</h2>
      <figure><ResilientMediaImage sizes="100vw" src={imageUrl} alt={`${title} ${imageIndex + 1}번째 이미지 확대`} /></figure>
    </div>
  </dialog>;
}
