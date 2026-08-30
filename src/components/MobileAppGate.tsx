"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import {
  isMobileStandalonePath,
  MOBILE_APP_MEDIA_QUERY,
  MOBILE_PC_VIEW_SESSION_KEY,
  toMobileAppPath,
} from "@/lib/navigation/mobile-app-route";

const REDIRECT_DELAY_MS = 650;

function subscribeToMobile(callback: () => void) {
  if (typeof window === "undefined") return () => {};

  const query = window.matchMedia(MOBILE_APP_MEDIA_QUERY);
  query.addEventListener("change", callback);

  return () => {
    query.removeEventListener("change", callback);
  };
}

function readIsMobile() {
  if (typeof window === "undefined") return false;
  return window.matchMedia(MOBILE_APP_MEDIA_QUERY).matches;
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
    return window.sessionStorage.getItem(MOBILE_PC_VIEW_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export default function MobileAppGate() {
  const pathname = usePathname();
  const router = useRouter();
  const isStandalonePage = isMobileStandalonePath(pathname);
  const isMobile = useSyncExternalStore(subscribeToMobile, readIsMobile, () => false);
  const pcChoice = useSyncExternalStore(subscribeToPcChoice, readPcChoice, () => false);

  const appPath = useMemo(() => {
    const search = typeof window === "undefined" ? "" : window.location.search.slice(1);
    return toMobileAppPath(pathname, search);
  }, [pathname]);
  const shouldShow = isMobile && !pcChoice && !pathname.startsWith("/app") && !isStandalonePage;

  useEffect(() => {
    if (pathname.startsWith("/app")) return;
    if (isStandalonePage) return;
    if (!readIsMobile() || readPcChoice()) return;

    const timeoutId = window.setTimeout(() => {
      window.location.replace(toMobileAppPath(pathname, window.location.search.slice(1)));
    }, REDIRECT_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isStandalonePage, pathname]);

  useEffect(() => {
    if (!shouldShow) return;
    const target = toMobileAppPath(pathname, window.location.search.slice(1));

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
      window.sessionStorage.setItem(MOBILE_PC_VIEW_SESSION_KEY, "1");
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
