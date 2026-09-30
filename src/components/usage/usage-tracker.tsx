"use client";
import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { USAGE_ACTIONS, usageRoute, type UsageEvent } from "@/modules/usage/domain/usage";

export const USAGE_OPT_OUT = "klol-usage-opt-out";
export function usageOptedOut() {
  try { return navigator.doNotTrack === "1" || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true || localStorage.getItem(USAGE_OPT_OUT) === "1"; }
  catch { return true; }
}

// Serialize requests so the first response installs the HttpOnly visitor cookie before subsequent events.
let delivery = Promise.resolve();
function send(event: Omit<UsageEvent, "id">) {
  if (usageOptedOut() || navigator.webdriver) return;
  const payload = { ...event, id: crypto.randomUUID() };
  delivery = delivery.then(async () => {
    if (usageOptedOut()) return;
    await fetch("/api/usage/events", { method: "POST", credentials: "same-origin", keepalive: true,
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).catch(() => undefined);
  }).catch(() => undefined);
}

export function UsageTracker() {
  const path = usePathname();
  const search = useSearchParams();
  const previous = useRef<string | null>(null);
  useEffect(() => {
    const route = usageRoute(path);
    const location = `${path}?${search.toString()}`;
    if (!route || previous.current === location) return;
    previous.current = location;
    send({ kind: "page", route, target: null });
    if (route === "/players" && search.get("q")?.trim()) send({ kind: "search", route, target: null });
  }, [path, search]);

  useEffect(() => {
    const click = (event: MouseEvent) => {
      if (!event.isTrusted || !(event.target instanceof Element)) return;
      const route = usageRoute(window.location.pathname);
      if (!route) return;
      const control = event.target.closest("[data-usage-action], a[href]");
      if (!control || control.matches(":disabled, [aria-disabled='true']")) return;
      const action = control.getAttribute("data-usage-action");
      if (action && Object.hasOwn(USAGE_ACTIONS, action)) { send({ kind: "click", route, target: action }); return; }
      if (!(control instanceof HTMLAnchorElement)) return;
      const url = new URL(control.href, window.location.origin);
      const target = url.origin === window.location.origin ? usageRoute(url.pathname) : null;
      if (target) send({ kind: "click", route, target });
    };
    document.addEventListener("click", click, true);
    return () => document.removeEventListener("click", click, true);
  }, []);
  return null;
}
