"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { isRememberedList, safeListReturn } from "@/modules/navigation/domain/list-return";

const key = (pathname: string) => `klol:list:${pathname}`;

export function ListNavigationMemory() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  useEffect(() => {
    if (!isRememberedList(pathname)) return;
    const storageKey = key(pathname);
    const save = () => {
      try { sessionStorage.setItem(storageKey, JSON.stringify({ href: pathname + (search ? `?${search}` : ""), scroll: window.scrollY })); } catch { /* Storage can be disabled. Normal links remain usable. */ }
    };
    let frame = 0;
    let saveFrame = 0;
    const requestSave = () => { if (!saveFrame) saveFrame = requestAnimationFrame(() => { saveFrame = 0; save(); }); };
    try {
      if (sessionStorage.getItem("klol:list:restore") === storageKey) {
        sessionStorage.removeItem("klol:list:restore");
        const stored = JSON.parse(sessionStorage.getItem(storageKey) ?? "null") as { scroll?: number } | null;
        const scroll = stored?.scroll;
        if (typeof scroll === "number" && Number.isFinite(scroll)) frame = requestAnimationFrame(() => window.scrollTo(0, Math.max(0, scroll)));
      } else save();
    } catch { /* Ignore malformed state from a previous browser session. */ }
    window.addEventListener("scroll", requestSave, { passive: true });
    window.addEventListener("pagehide", save);
    return () => { cancelAnimationFrame(frame); cancelAnimationFrame(saveFrame); window.removeEventListener("scroll", requestSave); window.removeEventListener("pagehide", save); };
  }, [pathname, search]);
  return null;
}

export function BackToList({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  const router = useRouter();
  return <Link href={href} className={className ?? "return-link"} onClick={(event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    try {
      const pathname = new URL(href, window.location.origin).pathname;
      const stored = JSON.parse(sessionStorage.getItem(key(pathname)) ?? "null") as { href?: string } | null;
      const target = safeListReturn(typeof stored?.href === "string" ? stored.href : null, href);
      if (stored && target === stored.href) {
        event.preventDefault(); sessionStorage.setItem("klol:list:restore", key(pathname)); router.push(target, { scroll: false });
      }
    } catch { /* Follow the original URL if browser storage is unavailable. */ }
  }}>{children}</Link>;
}
