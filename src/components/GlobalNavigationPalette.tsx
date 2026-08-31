"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  getNavigationCatalog,
  getNavigationHref,
  type NavigationMode,
} from "@/lib/navigation/catalog";

type GlobalNavigationPaletteProps = {
  mode: NavigationMode;
  surface?: "web" | "app";
  compact?: boolean;
};

const MAX_RECENT_ITEMS = 5;

function normalize(value: string) {
  return value.toLocaleLowerCase("ko-KR").replace(/\s+/g, "");
}

function readStoredList(key: string) {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || "[]");
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export default function GlobalNavigationPalette({
  mode,
  surface = "web",
  compact = false,
}: GlobalNavigationPaletteProps) {
  const router = useRouter();
  const pathname = usePathname();
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [canViewSuper, setCanViewSuper] = useState(false);
  const catalog = useMemo(
    () => getNavigationCatalog(mode).filter((item) => item.access !== "SUPER" || canViewSuper),
    [canViewSuper, mode],
  );
  const storagePrefix = `klol-navigation-${mode}-${surface}`;
  const recentKey = `${storagePrefix}-recent`;
  const favoritesKey = `${storagePrefix}-favorites`;

  const showPalette = useCallback(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setRecent(readStoredList(recentKey));
    setFavorites(readStoredList(favoritesKey));
    setOpen(true);
  }, [favoritesKey, recentKey]);

  const closePalette = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  useEffect(() => {
    if (mode !== "admin") return;
    let cancelled = false;

    fetch("/api/auth/me", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data: { user?: { role?: string; status?: string } } | null) => {
        if (!cancelled) {
          setCanViewSuper(data?.user?.role === "SUPER_ADMIN" && data.user.status === "APPROVED");
        }
      })
      .catch(() => {
        if (!cancelled) setCanViewSuper(false);
      });

    return () => {
      cancelled = true;
    };
  }, [mode]);

  useEffect(() => {
    const matchingItem = catalog
      .filter((item) => {
        const href = getNavigationHref(item, surface).split("?")[0];
        if (href === "/" || href === "/app" || href === "/admin" || href === "/app/admin") {
          return pathname === href;
        }
        return pathname === href || pathname.startsWith(`${href}/`);
      })
      .sort((a, b) => (
        getNavigationHref(b, surface).split("?")[0].length
        - getNavigationHref(a, surface).split("?")[0].length
      ))[0];
    if (!matchingItem) return;

    const nextRecent = [
      matchingItem.href,
      ...readStoredList(recentKey).filter((href) => href !== matchingItem.href),
    ].slice(0, MAX_RECENT_ITEMS);
    window.localStorage.setItem(recentKey, JSON.stringify(nextRecent));
  }, [catalog, pathname, recentKey, surface]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        if (open) closePalette();
        else showPalette();
      }
      if (event.key === "Escape" && open) closePalette();
    };
    const handleOpenRequest = () => showPalette();

    window.addEventListener("keydown", handleShortcut);
    window.addEventListener("klol:open-navigation", handleOpenRequest);
    return () => {
      window.removeEventListener("keydown", handleShortcut);
      window.removeEventListener("klol:open-navigation", handleOpenRequest);
    };
  }, [closePalette, open, showPalette]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 0);
    const dialog = dialogRef.current;
    const handleFocusTrap = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !dialog) return;

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    dialog?.addEventListener("keydown", handleFocusTrap);
    return () => {
      window.clearTimeout(focusTimer);
      dialog?.removeEventListener("keydown", handleFocusTrap);
      document.body.style.overflow = previousOverflow;
      const previousFocus = previousFocusRef.current;
      previousFocusRef.current = null;
      if (previousFocus && document.contains(previousFocus)) {
        previousFocus.focus();
      }
    };
  }, [open]);

  const visibleItems = useMemo(() => {
    const normalizedQuery = normalize(query);
    if (normalizedQuery) {
      return catalog.filter((item) =>
        normalize(
          [item.label, item.description, item.section, ...item.keywords].join(" "),
        ).includes(normalizedQuery),
      );
    }

    const priority = [...favorites, ...recent];
    return [...catalog].sort((a, b) => {
      const aIndex = priority.indexOf(a.href);
      const bIndex = priority.indexOf(b.href);
      if (aIndex === -1 && bIndex === -1) return 0;
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
  }, [catalog, favorites, query, recent]);

  const navigate = (itemHref: string) => {
    const item = catalog.find((candidate) => candidate.href === itemHref);
    if (!item) return;
    const nextRecent = [
      item.href,
      ...recent.filter((href) => href !== item.href),
    ].slice(0, MAX_RECENT_ITEMS);
    window.localStorage.setItem(recentKey, JSON.stringify(nextRecent));
    setRecent(nextRecent);
    closePalette();
    router.push(getNavigationHref(item, surface));
  };

  const toggleFavorite = (itemHref: string) => {
    const nextFavorites = favorites.includes(itemHref)
      ? favorites.filter((href) => href !== itemHref)
      : [itemHref, ...favorites];
    window.localStorage.setItem(favoritesKey, JSON.stringify(nextFavorites));
    setFavorites(nextFavorites);
  };

  return (
    <>
      <button
        className={`global-navigation-trigger${compact ? " global-navigation-trigger--compact" : ""}`}
        type="button"
        onClick={showPalette}
        aria-haspopup="dialog"
        aria-label="전체 메뉴 열기"
      >
        <span aria-hidden="true">⌕</span>
        <strong>{compact ? "메뉴" : "전체 메뉴"}</strong>
        {!compact ? <kbd>Ctrl K</kbd> : null}
      </button>

      {open ? (
        <div
          className="global-navigation-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closePalette();
          }}
        >
          <section
            ref={dialogRef}
            className="global-navigation-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="global-navigation-title"
            aria-describedby="global-navigation-hint"
          >
            <header className="global-navigation-dialog__header">
              <div>
                <span>ALL MENU</span>
                <h2 id="global-navigation-title">전체 메뉴에서 바로 이동</h2>
              </div>
              <button type="button" onClick={closePalette} aria-label="전체 메뉴 닫기">
                닫기
              </button>
            </header>

            <label className="global-navigation-search">
              <span aria-hidden="true">⌕</span>
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="예: 전적, 참가 신청, 팀 밸런스, 징계"
                aria-label="이동할 메뉴 검색"
              />
            </label>

            <p
              id="global-navigation-hint"
              className="global-navigation-hint"
              role="status"
              aria-live="polite"
            >
              {query
                ? `검색 결과 ${visibleItems.length}개`
                : favorites.length > 0 || recent.length > 0
                  ? `전체 ${visibleItems.length}개 · 즐겨찾기와 최근 사용 메뉴를 먼저 표시합니다.`
                  : `전체 ${visibleItems.length}개 메뉴 · 별표를 누르면 즐겨찾기에 고정됩니다.`}
            </p>

            <div className="global-navigation-results">
              {visibleItems.length === 0 ? (
                <div className="global-navigation-empty">
                  일치하는 메뉴가 없습니다.
                </div>
              ) : (
                visibleItems.map((item) => {
                  const favorite = favorites.includes(item.href);
                  const isRecent = recent.includes(item.href);
                  return (
                    <div className="global-navigation-result" key={item.href}>
                      <button
                        className="global-navigation-result__main"
                        type="button"
                        onClick={() => navigate(item.href)}
                      >
                        <span>{item.section}</span>
                        <strong>{item.label}</strong>
                        <small>{item.description}</small>
                        {isRecent && !favorite ? <em>최근 사용</em> : null}
                      </button>
                      <button
                        className="global-navigation-result__favorite"
                        type="button"
                        data-active={favorite}
                        onClick={() => toggleFavorite(item.href)}
                        aria-label={`${item.label} ${favorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}`}
                        title={favorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}
                      >
                        {favorite ? "★" : "☆"}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
