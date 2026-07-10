"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useSyncExternalStore } from "react";

const MOBILE_QUERY = "(max-width: 820px)";
const SESSION_KEY = "klol-mobile-pc-view";
const REDIRECT_DELAY_MS = 650;

function appendSearch(target: string, search?: string) {
  if (!search) return target;
  return target.includes("?") ? `${target}&${search}` : `${target}?${search}`;
}

function detailTarget(pathname: string, sourcePrefix: string, appPrefix: string) {
  const [, id] = pathname.slice(sourcePrefix.length).match(/^\/(\d+)/) ?? [];
  return id ? `${appPrefix}/${id}` : appPrefix;
}

function toAppPath(pathname: string, search?: string) {
  let target = "/app";

  if (pathname === "/" || pathname === "") target = "/app";
  else if (pathname.startsWith("/app")) target = pathname;
  else if (pathname.startsWith("/admin")) target = "/app/admin";
  else if (
    pathname.startsWith("/players/balance") ||
    pathname.startsWith("/balance") ||
    pathname.startsWith("/random-team")
  ) {
    target = "/app";
  } else if (pathname.startsWith("/players/")) target = detailTarget(pathname, "/players", "/app/players");
  else if (pathname === "/players") target = "/app/players";
  else if (pathname.startsWith("/matches/")) target = detailTarget(pathname, "/matches", "/app/matches");
  else if (pathname === "/matches") target = "/app/matches";
  else if (pathname === "/rankings" || pathname.startsWith("/ai-balance")) target = "/app/rankings";
  else if (
    pathname.startsWith("/recruit") ||
    pathname.startsWith("/kakao") ||
    pathname.startsWith("/recruit-helper")
  ) {
    target = "/app/recruits";
  } else if (pathname.startsWith("/progress") || pathname.startsWith("/participation")) {
    target = "/app/matches?tab=events";
  } else if (pathname.startsWith("/riot-api")) target = "/app/me";
  else if (pathname.startsWith("/account") || pathname.startsWith("/me")) target = "/app/me";
  else if (pathname.startsWith("/login") || pathname.startsWith("/signup")) target = "/app/login";

  return appendSearch(target, search);
}

function subscribeToMobile(callback: () => void) {
  if (typeof window === "undefined") return () => {};

  const query = window.matchMedia(MOBILE_QUERY);
  query.addEventListener("change", callback);

  return () => {
    query.removeEventListener("change", callback);
  };
}

function readIsMobile() {
  if (typeof window === "undefined") return false;
  return window.matchMedia(MOBILE_QUERY).matches;
}

function subscribeToPcChoice(callback: () => void) {
  if (typeof window === "undefined") return () => {};

  window.addEventListener("storage", callback);
  window.addEventListener("klol-mobile-pc-choice", callback);

  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("klol-mobile-pc-choice", callback);
  };
}

function readPcChoice() {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export default function MobileAppGate() {
  const pathname = usePathname();
  const router = useRouter();
  const isMobile = useSyncExternalStore(subscribeToMobile, readIsMobile, () => false);
  const pcChoice = useSyncExternalStore(subscribeToPcChoice, readPcChoice, () => false);

  const appPath = useMemo(() => toAppPath(pathname), [pathname]);
  const shouldShow = isMobile && !pcChoice && !pathname.startsWith("/app");

  useEffect(() => {
    if (pathname.startsWith("/app")) return;
    if (!readIsMobile() || readPcChoice()) return;

    const timeoutId = window.setTimeout(() => {
      window.location.replace(toAppPath(pathname, window.location.search.slice(1)));
    }, REDIRECT_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [pathname]);

  useEffect(() => {
    if (!shouldShow) return;
    const target = toAppPath(pathname, window.location.search.slice(1));

    const timeoutId = window.setTimeout(() => {
      try {
        router.replace(target);
      } catch {
        window.location.replace(target);
      }
    }, REDIRECT_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [pathname, router, shouldShow]);

  if (!shouldShow) {
    return null;
  }

  const continuePc = () => {
    try {
      window.sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      // Storage can be unavailable in restricted mobile browser contexts.
    }
    window.dispatchEvent(new Event("klol-mobile-pc-choice"));
  };

  return (
    <div className="mobile-app-gate" role="dialog" aria-modal="true" aria-labelledby="mobile-app-gate-title">
      <div className="mobile-app-gate__panel">
        <span className="mobile-app-gate__eyebrow">K-LOL.GG APP</span>
        <h2 id="mobile-app-gate-title">모바일 화면으로 여는 중</h2>
        <p>
          핸드폰에서는 앱 전용 화면이 더 빠르고 보기 좋습니다. 잠시 후 자동으로 이동합니다.
        </p>
        <div className="mobile-app-gate__actions">
          <Link className="mobile-app-gate__primary" href={appPath}>
            앱 화면으로 이동
          </Link>
          <button className="mobile-app-gate__secondary" type="button" onClick={continuePc}>
            PC 화면 계속 보기
          </button>
        </div>
      </div>
    </div>
  );
}
