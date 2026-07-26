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
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const catalog = useMemo(() => getNavigationCatalog(mode), [mode]);
  const storagePrefix = `klol-navigation-${mode}-${surface}`;
  const recentKey = `${storagePrefix}-recent`;
  const favoritesKey = `${storagePrefix}-favorites`;

  const showPalette = useCallback(() => {
    setRecent(readStoredList(recentKey));
    setFavorites(readStoredList(favoritesKey));
    setOpen(true);
  }, [favoritesKey, recentKey]);

  useEffect(() => {
    const matchingItem = catalog.find((item) => {
      const href = getNavigationHref(item, surface).split("?")[0];
      if (href === "/" || href === "/app" || href === "/admin" || href === "/app/admin") {
        return pathname === href;
      }
      return pathname === href || pathname.startsWith(`${href}/`);
    });
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
        if (open) setOpen(false);
        else showPalette();
      }
      if (event.key === "Escape") setOpen(false);
    };
    const handleOpenRequest = () => showPalette();

    window.addEventListener("keydown", handleShortcut);
    window.addEventListener("klol:open-navigation", handleOpenRequest);
    return () => {
      window.removeEventListener("keydown", handleShortcut);
      window.removeEventListener("klol:open-navigation", handleOpenRequest);
    };
  }, [open, showPalette]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      document.body.style.overflow = previousOverflow;
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
    setOpen(false);
    setQuery("");
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
      >
        <span aria-hidden="true">⌕</span>
        <strong>{compact ? "이동" : "빠른 이동"}</strong>
        {!compact ? <kbd>Ctrl K</kbd> : null}
      </button>

      {open ? (
        <div
          className="global-navigation-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <section
            className="global-navigation-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="global-navigation-title"
          >
            <header className="global-navigation-dialog__header">
              <div>
                <span>QUICK NAVIGATION</span>
                <h2 id="global-navigation-title">어디로 이동할까요?</h2>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="빠른 이동 닫기">
                닫기
              </button>
            </header>

            <label className="global-navigation-search">
              <span aria-hidden="true">⌕</span>
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="기능이나 메뉴 이름을 입력하세요"
                aria-label="이동할 메뉴 검색"
              />
            </label>

            {!query && (favorites.length > 0 || recent.length > 0) ? (
              <p className="global-navigation-hint">
                즐겨찾기와 최근 사용 메뉴를 먼저 보여드려요.
              </p>
            ) : null}

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
