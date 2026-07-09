"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useSyncExternalStore } from "react";

const MOBILE_QUERY = "(max-width: 820px)";
const SESSION_KEY = "klol-mobile-pc-view";

function toAppPath(pathname: string) {
  if (pathname === "/" || pathname === "") return "/app";
  if (pathname.startsWith("/app")) return pathname;
  if (pathname.startsWith("/admin")) return "/app/admin";
  if (pathname.startsWith("/players/")) return pathname.replace("/players", "/app/players");
  if (pathname === "/players") return "/app/players";
  if (pathname.startsWith("/matches/")) return pathname.replace("/matches", "/app/matches");
  if (pathname === "/matches") return "/app/matches";
  if (pathname === "/rankings") return "/app/rankings";
  if (pathname === "/recruit") return "/app/recruits";
  if (pathname.startsWith("/account") || pathname.startsWith("/me")) return "/app/me";
  return "/app";
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
  return window.sessionStorage.getItem(SESSION_KEY) === "1";
}

export default function MobileAppGate() {
  const pathname = usePathname();
  const router = useRouter();
  const isMobile = useSyncExternalStore(subscribeToMobile, readIsMobile, () => false);
  const pcChoice = useSyncExternalStore(subscribeToPcChoice, readPcChoice, () => false);

  const appPath = useMemo(() => toAppPath(pathname), [pathname]);
  const shouldShow = isMobile && !pcChoice && !pathname.startsWith("/app");

  useEffect(() => {
    if (!shouldShow) return;

    const timeoutId = window.setTimeout(() => {
      router.replace(appPath);
    }, 2500);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [appPath, router, shouldShow]);

  if (!shouldShow) {
    return null;
  }

  const continuePc = () => {
    window.sessionStorage.setItem(SESSION_KEY, "1");
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
