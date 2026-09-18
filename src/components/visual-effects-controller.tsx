"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const REVEAL_CANDIDATES = [
  ":scope > header",
  ":scope > section",
  ":scope > article",
  ":scope > form",
  ":scope > nav",
  ":scope > div > header",
  ":scope > div > section",
  ":scope > div > article",
  "article",
  "[data-slot='card']",
].join(",");

const SURFACE_NAME = /(card|panel|tile|summary|stat|result|workspace)/i;

function pageRoots() {
  return Array.from(document.querySelectorAll<HTMLElement>(
    "#main-content > *, [data-ui-scope='admin'] main, body > main",
  ));
}

function decorateElement(
  element: HTMLElement,
  index: number,
  revealObserver: IntersectionObserver | null,
) {
  if (element.closest("[role='dialog']") || element.getAttribute("aria-hidden") === "true") return;

  element.dataset.uiReveal = "true";
  element.dataset.uiEffectDelay = String(index % 6);

  const className = typeof element.className === "string" ? element.className : "";
  if (element.dataset.slot === "card" || SURFACE_NAME.test(className)) {
    element.dataset.uiSurface = element.closest("[data-ui-scope='admin']") ? "operational" : "feature";
  }

  if (revealObserver) {
    revealObserver.observe(element);
  } else {
    requestAnimationFrame(() => {
      element.dataset.uiVisible = "true";
    });
  }
}

export function VisualEffectsController() {
  const pathname = usePathname();

  useEffect(() => {
    const root = document.documentElement;
    const decorated = new Set<HTMLElement>();
    let scrollFrame = 0;
    const canAnimate = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const revealObserver = typeof IntersectionObserver === "undefined" || !canAnimate
      ? null
      : new IntersectionObserver((entries, observer) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            (entry.target as HTMLElement).dataset.uiVisible = "true";
            observer.unobserve(entry.target);
          }
        }, { rootMargin: "0px 0px -4%", threshold: 0.06 });

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

    function decoratePage() {
      let effectIndex = 0;
      for (const pageRoot of pageRoots()) {
        pageRoot.dataset.uiPage = "true";
        decorated.add(pageRoot);
        for (const candidate of pageRoot.querySelectorAll<HTMLElement>(REVEAL_CANDIDATES)) {
          if (decorated.has(candidate)) continue;
          decorated.add(candidate);
          decorateElement(candidate, effectIndex, revealObserver);
          effectIndex += 1;
        }
      }
      root.dataset.uiEffects = "ready";
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

    decoratePage();
    updateScrollProgress();

    const mutationObserver = new MutationObserver(() => decoratePage());
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("scroll", requestProgressUpdate, { passive: true });
    window.addEventListener("resize", requestProgressUpdate, { passive: true });
    if (heroArt && finePointer && canAnimate) {
      heroArt.addEventListener("pointermove", updateHeroLight, { passive: true });
      heroArt.addEventListener("pointerleave", resetHeroLight, { passive: true });
    }

    return () => {
      mutationObserver.disconnect();
      revealObserver?.disconnect();
      window.removeEventListener("scroll", requestProgressUpdate);
      window.removeEventListener("resize", requestProgressUpdate);
      heroArt?.removeEventListener("pointermove", updateHeroLight);
      heroArt?.removeEventListener("pointerleave", resetHeroLight);
      resetHeroLight();
      if (scrollFrame) window.cancelAnimationFrame(scrollFrame);
      for (const element of decorated) {
        delete element.dataset.uiPage;
        delete element.dataset.uiReveal;
        delete element.dataset.uiEffectDelay;
        delete element.dataset.uiVisible;
        delete element.dataset.uiSurface;
      }
      delete root.dataset.uiEffects;
      delete root.dataset.uiScrolled;
      root.style.removeProperty("--page-scroll-progress");
    };
  }, [pathname]);

  return <span className="site-scroll-progress" aria-hidden="true" />;
}
