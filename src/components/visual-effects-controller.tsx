"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

export function VisualEffectsController() {
  const pathname = usePathname();

  // Streamed route markup may still be hydrating when this layout mounts.
  // Keep automatic decoration in CSS; never mutate descendants to reveal them.
  useEffect(() => {
    const root = document.documentElement;
    let scrollFrame = 0;
    const canAnimate = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const heroArt = document.querySelector<HTMLElement>(".hero-art");
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

    function updateHeroLight(event: PointerEvent) {
      if (!heroArt) return;
      const bounds = heroArt.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
      const y = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height));
      heroArt.style.setProperty("--hero-light-x", `${(x * 100).toFixed(1)}%`);
      heroArt.style.setProperty("--hero-light-y", `${(y * 100).toFixed(1)}%`);
      heroArt.style.setProperty("--hero-shift-x", `${((x - 0.5) * 8).toFixed(2)}px`);
      heroArt.style.setProperty("--hero-shift-y", `${((y - 0.5) * 6).toFixed(2)}px`);
    }

    function resetHeroLight() {
      heroArt?.style.removeProperty("--hero-light-x");
      heroArt?.style.removeProperty("--hero-light-y");
      heroArt?.style.removeProperty("--hero-shift-x");
      heroArt?.style.removeProperty("--hero-shift-y");
    }

    function updateScrollProgress() {
      scrollFrame = 0;
      const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = scrollHeight > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollHeight)) : 0;
      root.style.setProperty("--page-scroll-progress", progress.toFixed(4));
      root.dataset.uiScrolled = window.scrollY > 20 ? "true" : "false";
    }

    function requestProgressUpdate() {
      if (scrollFrame) return;
      scrollFrame = window.requestAnimationFrame(updateScrollProgress);
    }

    updateScrollProgress();

    window.addEventListener("scroll", requestProgressUpdate, { passive: true });
    window.addEventListener("resize", requestProgressUpdate, { passive: true });
    if (heroArt && finePointer && canAnimate) {
      heroArt.addEventListener("pointermove", updateHeroLight, { passive: true });
      heroArt.addEventListener("pointerleave", resetHeroLight, { passive: true });
    }

    return () => {
      window.removeEventListener("scroll", requestProgressUpdate);
      window.removeEventListener("resize", requestProgressUpdate);
      heroArt?.removeEventListener("pointermove", updateHeroLight);
      heroArt?.removeEventListener("pointerleave", resetHeroLight);
      resetHeroLight();
      if (scrollFrame) window.cancelAnimationFrame(scrollFrame);
      delete root.dataset.uiScrolled;
      root.style.removeProperty("--page-scroll-progress");
    };
  }, [pathname]);

  return <span className="site-scroll-progress" aria-hidden="true" />;
}
