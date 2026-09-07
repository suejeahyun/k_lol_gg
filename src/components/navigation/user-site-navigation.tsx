"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CalendarCheck2,
  Dices,
  Home,
  LogIn,
  Menu,
  Search,
  Sparkles,
  Swords,
  Trophy,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";

import {
  canonicalUserRoutes,
  isUserNavigationActive,
  primaryUserNavigation,
  userNavigationSections,
} from "@/modules/navigation/domain/user-navigation";
import { findGlobalCommands, playerSearchHref } from "@/modules/navigation/domain/global-command-palette";

function openDialog(dialog: HTMLDialogElement | null, initialFocus?: HTMLElement | null) {
  if (!dialog || dialog.open) return;
  dialog.showModal();
  if (initialFocus) window.requestAnimationFrame(() => initialFocus.focus());
}

function closeDialog(dialog: HTMLDialogElement | null) {
  if (dialog?.open) dialog.close();
}

function SearchControl({ compact = false, accountSignedIn = false }: { compact?: boolean; accountSignedIn?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const resultLinks = useRef<(HTMLAnchorElement | null)[]>([]);
  const titleId = useId();
  const inputId = useId();
  const resultsId = useId();
  const [query, setQuery] = useState("");
  const commands = useMemo(() => findGlobalCommands(query, { accountSignedIn }), [accountSignedIn, query]);
  const playerHref = playerSearchHref(query);

  function openSearch() {
    setQuery("");
    openDialog(dialog.current, input.current);
  }

  useEffect(() => {
    if (compact) return;
    function shortcut(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const editing = target?.matches("input, textarea, select, [contenteditable='true']");
      if ((event.key.toLocaleLowerCase("en-US") === "k" && (event.ctrlKey || event.metaKey)) || (event.key === "/" && !editing)) {
        event.preventDefault();
        setQuery("");
        openDialog(dialog.current, input.current);
      }
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [compact]);

  function focusResult(index: number) {
    resultLinks.current[index]?.focus();
  }

  return (
    <>
      <button
        className={compact ? "mobile-nav__action" : "header-icon-action"}
        type="button"
        aria-haspopup="dialog"
        aria-label="전체 검색 열기"
        aria-keyshortcuts="Control+K Meta+K /"
        title="전체 검색 (Ctrl+K)"
        onClick={openSearch}
      >
        <Search size={compact ? 20 : 18} aria-hidden="true" />
        {compact ? <span>검색</span> : null}
      </button>

      <dialog
        className="user-dialog"
        ref={dialog}
        aria-labelledby={titleId}
        onCancel={() => closeDialog(dialog.current)}
        onKeyDown={(event) => {
          if (event.key === "Escape") closeDialog(dialog.current);
        }}
      >
        <div className="user-dialog__panel">
          <div className="user-dialog__heading">
            <div>
              <span>COMMAND PALETTE</span>
              <h2 id={titleId}>무엇을 찾고 있나요?</h2>
            </div>
            <button type="button" aria-label="검색 닫기" onClick={() => closeDialog(dialog.current)}>
              <X size={20} aria-hidden="true" />
            </button>
          </div>

          <form className="global-search-form" action="/players" method="get" role="search" onSubmit={() => closeDialog(dialog.current)}>
            <label htmlFor={inputId}>페이지, 도구, 콘텐츠 또는 플레이어</label>
            <div>
              <Search size={19} aria-hidden="true" />
              <input
                ref={input}
                id={inputId}
                name="q"
                type="search"
                maxLength={80}
                placeholder="예: 팀 밸런스, 대회, GameName#TAG"
                autoComplete="off"
                value={query}
                aria-controls={resultsId}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown" && commands.length) {
                    event.preventDefault();
                    focusResult(0);
                  }
                }}
              />
              {playerHref ? <button className="global-search-form__player" type="submit">플레이어 검색</button> : <span className="global-search-form__shortcut" aria-hidden="true">Ctrl K</span>}
            </div>
          </form>
          <div className="command-palette-results" id={resultsId} aria-live="polite">
            <div className="command-palette-results__heading"><span>{query ? "검색 결과" : "바로 가기"}</span><small>{commands.length}개</small></div>
            {commands.length ? <ul aria-label="접근 가능한 페이지와 기능">{commands.map((command, index) => <li key={command.id}><Link
              ref={(node) => { resultLinks.current[index] = node; }}
              href={command.href}
              onClick={() => closeDialog(dialog.current)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") { event.preventDefault(); focusResult(Math.min(index + 1, commands.length - 1)); }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  if (index === 0) input.current?.focus();
                  else focusResult(index - 1);
                }
              }}
            ><span><small>{command.group}</small><strong>{command.label}</strong><em>{command.description}</em></span><ArrowRight aria-hidden="true" /></Link></li>)}</ul> : <p className="command-palette-empty">일치하는 바로 가기가 없어요. 입력한 이름은 위의 플레이어 검색으로 찾아볼 수 있습니다.</p>}
          </div>
          <p className="user-dialog__hint">
            로그인 전에는 공개 기능만 표시합니다. 계정 아이디·회원명·Discord 식별자는 플레이어 검색 대상이 아닙니다.
          </p>
        </div>
      </dialog>
    </>
  );
}

function AllMenuControl({ compact = false }: { compact?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  return (
    <>
      <button
        className={compact ? "mobile-nav__action" : "header-icon-action"}
        type="button"
        aria-haspopup="dialog"
        aria-label="전체 메뉴 열기"
        onClick={() => openDialog(dialog.current)}
      >
        <Menu size={compact ? 20 : 18} aria-hidden="true" />
        {compact ? <span>메뉴</span> : null}
      </button>

      <dialog
        className="user-dialog user-dialog--menu"
        ref={dialog}
        aria-labelledby={titleId}
        onCancel={() => closeDialog(dialog.current)}
        onKeyDown={(event) => {
          if (event.key === "Escape") closeDialog(dialog.current);
        }}
      >
        <div className="user-dialog__panel">
          <div className="user-dialog__heading">
            <div>
              <span>ALL FEATURES</span>
              <h2 id={titleId}>전체 기능</h2>
            </div>
            <button type="button" aria-label="전체 메뉴 닫기" onClick={() => closeDialog(dialog.current)}>
              <X size={20} aria-hidden="true" />
            </button>
          </div>

          <p className="user-dialog__hint user-dialog__hint--top">
            찾는 기능을 빠르게 열 수 있도록 역할과 이용 흐름별로 모았습니다.
          </p>
          <div className="all-menu-grid">
            {userNavigationSections.map((section) => (
              <section key={section.id} aria-labelledby={`${titleId}-${section.id}`}>
                <h3 id={`${titleId}-${section.id}`}>{section.label}</h3>
                <ul>
                  {canonicalUserRoutes
                    .filter((route) => route.section === section.id && !route.template.includes("["))
                    .map((route) => (
                      <li key={route.template}>
                        {route.implementationState === "page-contract" ? (
                          <Link href={route.template} onClick={() => closeDialog(dialog.current)}>
                            {route.label}
                            <span>바로 열기</span>
                          </Link>
                        ) : (
                          <span aria-disabled="true">
                            {route.label}
                            <small>준비 중</small>
                          </span>
                        )}
                      </li>
                    ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      </dialog>
    </>
  );
}

export function PrimaryUserNavigation() {
  const pathname = usePathname();

  return (
    <nav className="desktop-nav" aria-label="주요 메뉴">
      {primaryUserNavigation.map((item) => (
        <Link
          href={item.href}
          key={item.href}
          aria-current={isUserNavigationActive(pathname, item.activeRoot) ? "page" : undefined}
        >
          {item.href === "/" ? (
            <Home size={16} aria-hidden="true" />
          ) : item.href === "/players" ? (
            <UsersRound size={16} aria-hidden="true" />
          ) : item.href === "/rankings" ? (
            <Trophy size={16} aria-hidden="true" />
          ) : item.href === "/matches" ? (
            <Swords size={16} aria-hidden="true" />
          ) : item.href.startsWith("/tools/") ? (
            <Dices size={16} aria-hidden="true" />
          ) : (
            <CalendarCheck2 size={16} aria-hidden="true" />
          )}
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function HeaderUserControls({ accountSignedIn = false }: { accountSignedIn?: boolean }) {
  return (
    <div className="header-actions">
      <SearchControl accountSignedIn={accountSignedIn} />
      <AllMenuControl />
      <Link className="header-account" href={accountSignedIn ? "/account" : "/login"} aria-label={accountSignedIn ? "내 계정" : "사용자 로그인"}>
        <UserRound size={17} aria-hidden="true" />
        <span>{accountSignedIn ? "내 계정" : "로그인"}</span>
      </Link>
    </div>
  );
}

export function MobileUserNavigation({ accountSignedIn = false }: { accountSignedIn?: boolean }) {
  const pathname = usePathname();

  return (
    <nav className="mobile-nav" aria-label="모바일 주요 메뉴">
      <Link href="/" aria-current={pathname === "/" ? "page" : undefined}>
        <Home size={20} aria-hidden="true" />
        <span>홈</span>
      </Link>
      <Link
        href="/players"
        aria-current={isUserNavigationActive(pathname, "/players") ? "page" : undefined}
      >
        <UsersRound size={20} aria-hidden="true" />
        <span>플레이어</span>
      </Link>
      <SearchControl compact accountSignedIn={accountSignedIn} />
      <Link href={accountSignedIn ? "/account" : "/login"} aria-current={accountSignedIn ? (pathname.startsWith("/account") ? "page" : undefined) : (pathname === "/login" ? "page" : undefined)}>
        <LogIn size={20} aria-hidden="true" />
        <span>{accountSignedIn ? "계정" : "로그인"}</span>
      </Link>
      <AllMenuControl compact />
    </nav>
  );
}

export function NavigationFallback({ mobile = false }: { mobile?: boolean }) {
  if (mobile) {
    return (
      <nav className="mobile-nav" aria-label="모바일 주요 메뉴 불러오는 중">
        <Link href="/">
          <Sparkles size={20} aria-hidden="true" />
          <span>홈</span>
        </Link>
      </nav>
    );
  }

  return <div className="desktop-nav desktop-nav--loading" aria-hidden="true" />;
}
