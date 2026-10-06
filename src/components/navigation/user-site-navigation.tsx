"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CalendarCheck2,
  ChevronDown,
  Dices,
  Home,
  Menu,
  Search,
  Sparkles,
  Swords,
  UserRound,
  X,
} from "@/components/theme/theme-icons";

import {
  isUserNavigationActive,
} from "@/modules/navigation/domain/user-navigation";
import { findGlobalCommands, playerSearchHref } from "@/modules/navigation/domain/global-command-palette";

import { isTaskNavigationCurrent, userTaskGroups, personalTaskLinks, type TaskLink } from "@/modules/navigation/domain/task-navigation";
import { normalizeAccountNext } from "@/modules/auth/application/normalize-internal-next";
import { recordUsageAction } from "@/components/usage/usage-actions";

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
  const router = useRouter();
  useEffect(() => {
    if (!query.trim() || commands.length) return;
    const timer = window.setTimeout(() => recordUsageAction("search.empty"), 600);
    return () => window.clearTimeout(timer);
  }, [query, commands.length]);

  function openSearch() {
    recordUsageAction("search.open");
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
        recordUsageAction("search.open");
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
        <span>기능 찾기</span>
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
              <h2 id={titleId}>전체 검색</h2>
            </div>
            <button type="button" aria-label="검색 닫기" onClick={() => closeDialog(dialog.current)}>
              <X size={20} aria-hidden="true" />
            </button>
          </div>

          <form className="global-search-form" role="search" onSubmit={(event) => {
            event.preventDefault();
            const href = commands[0]?.href ?? playerHref;
            if (href) { recordUsageAction("search.select"); closeDialog(dialog.current); router.push(href); }
          }}>
            <label htmlFor={inputId}>페이지, 도구, 콘텐츠 또는 플레이어</label>
            <div>
              <Search size={19} aria-hidden="true" />
              <input
                ref={input}
                id={inputId}
                name="q"
                type="search"
                maxLength={80}
                placeholder="예: 내전 신청, 팀 만들기, 닉네임"
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
              {query ? <button className="global-search-form__player" type="submit">{commands.length ? "기능 열기" : "플레이어 검색"}</button> : <span className="global-search-form__shortcut" aria-hidden="true">Ctrl K</span>}
            </div>
          </form>
          <div className="command-palette-results" id={resultsId} aria-live="polite">
            <div className="command-palette-results__heading"><span>{query ? "검색 결과" : "바로 가기"}</span><small>{commands.length}개</small></div>
            {commands.length ? <ul aria-label="접근 가능한 페이지와 기능">{commands.map((command, index) => <li key={command.id}><Link
              ref={(node) => { resultLinks.current[index] = node; }}
              href={command.href}
              onClick={() => { recordUsageAction("search.select"); closeDialog(dialog.current); }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") { event.preventDefault(); focusResult(Math.min(index + 1, commands.length - 1)); }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  if (index === 0) input.current?.focus();
                  else focusResult(index - 1);
                }
              }}
            ><span><small>{command.group}{command.access === "ACCOUNT" && !accountSignedIn ? " · 로그인 필요" : ""}</small><strong>{command.label}</strong></span><ArrowRight aria-hidden="true" /></Link></li>)}</ul> : <p className="command-palette-empty">검색 결과가 없습니다.</p>}
          </div>
          {playerHref ? <Link className="search-player-link" href={playerHref} onClick={() => closeDialog(dialog.current)}>“{query}” 플레이어 이름으로 검색 <ArrowRight className="theme-inline-icon" aria-hidden="true" /></Link> : null}
        </div>
      </dialog>
    </>
  );
}

const helpLinks: readonly TaskLink[] = [
  { href: "/help", label: "도움말·문의" }, { href: "/start", label: "처음 이용 안내" }, { href: "/help/recruits", label: "모집 참가 방법" },
  { href: "/help/kakao", label: "카카오 이용 안내" }, { href: "/help/riot", label: "Riot 연결 안내" },
  { href: "/install", label: "앱 설치" }, { href: "/terms", label: "이용약관" }, { href: "/privacy", label: "개인정보 안내" },
];

function AllMenuControl({ compact = false, accountSignedIn = false }: { compact?: boolean; accountSignedIn?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  return (
    <>
      <button
        className={compact ? "mobile-nav__action" : "header-icon-action"}
        type="button"
        aria-haspopup="dialog"
        aria-label="전체 메뉴 열기"
        onClick={() => { recordUsageAction("navigation.open"); openDialog(dialog.current); }}
      >
        <Menu size={compact ? 20 : 18} aria-hidden="true" />
        <span>메뉴</span>
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
              <h2 id={titleId}>전체 기능</h2>
            </div>
            <button type="button" aria-label="전체 메뉴 닫기" onClick={() => closeDialog(dialog.current)}>
              <X size={20} aria-hidden="true" />
            </button>
          </div>

          <div className="all-menu-grid" data-usage-context="menu">
            {[...userTaskGroups, { label: "내 활동", links: personalTaskLinks }, { label: "도움말·계정", links: [...helpLinks, ...(accountSignedIn ? [] : [{ href: "/login", label: "로그인" }, { href: "/signup", label: "회원가입" }])] }].map((group, groupIndex) => (
              <details className="all-menu-section" key={group.label} open={groupIndex < 2}>
                <summary><h3 id={titleId + groupIndex}>{group.label}</h3><ChevronDown size={20} aria-hidden="true" /></summary>
                <ul>{group.links.filter((link) => group.label !== "커뮤니티" || !["/help", "/start"].includes(link.href)).map((link: TaskLink) => <li key={link.href}>
                  <Link href={link.href} onClick={() => closeDialog(dialog.current)}>{link.label}
                    {link.account && !accountSignedIn ? <span>로그인 필요</span> : null}
                  </Link>
                </li>)}</ul>
              </details>
            ))}
          </div>
        </div>
      </dialog>
    </>
  );
}

export function PrimaryUserNavigation() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    const close = () => nav.current?.querySelectorAll("details[open]").forEach((element) => element.removeAttribute("open"));
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !nav.current?.contains(event.target)) close(); };
    close();
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [pathname, searchParams]);
  return <nav ref={nav} className="desktop-nav task-navigation" aria-label="주요 메뉴" data-usage-context="header">
    {userTaskGroups.map((group) => <details className="task-menu" name="site-task-menu" key={group.label}
      data-active={group.roots.some((root) => isUserNavigationActive(pathname, root)) || undefined}
      onKeyDown={(event) => { if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); } }}>
      <summary>{group.label}<ChevronDown size={16} aria-hidden="true" /></summary>
      <div className="task-menu__links">{group.links.map((link) => <Link key={link.href} href={link.href}
        aria-current={isTaskNavigationCurrent(pathname, searchParams, link.href) ? "page" : undefined}
        onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); }}>{link.label}</Link>)}</div>
    </details>)}
  </nav>;
}

export function HeaderUserControls({ accountSignedIn = false }: { accountSignedIn?: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const authPage = ["/login", "/signup", "/forgot-password"].includes(pathname);
  const savedNext = searchParams.getAll("next");
  const next = normalizeAccountNext(authPage ? (savedNext.length === 1 ? savedNext[0] : undefined) : pathname + (searchParams.size ? `?${searchParams}` : ""), "/");
  const loginHref = `/login?next=${encodeURIComponent(next)}`;
  return (
    <div className="header-actions" data-usage-context="header">
      <SearchControl accountSignedIn={accountSignedIn} />
      <AllMenuControl accountSignedIn={accountSignedIn} />
      <Link className="header-account" href={accountSignedIn ? "/account" : loginHref} aria-label={accountSignedIn ? "내 정보" : "사용자 로그인"}>
        <UserRound size={17} aria-hidden="true" />
        <span>{accountSignedIn ? "내 정보" : "로그인"}</span>
      </Link>
    </div>
  );
}

export function MobileUserNavigation({ accountSignedIn = false }: { accountSignedIn?: boolean }) {
  const pathname = usePathname();
  const links = [
    { href: "/", label: "홈", icon: Home, roots: ["/"] },
    { href: "/applications", label: "참가·모집", icon: CalendarCheck2, roots: ["/applications", "/recruits"] },
    { href: "/tools/team-balance", label: "팀 만들기", icon: Dices, roots: ["/tools"] },
    { href: "/matches", label: "경기·전적", icon: Swords, roots: ["/matches", "/players", "/rankings"] },
    { href: accountSignedIn ? "/account" : "/login?next=%2Faccount", label: "내 활동", icon: UserRound, roots: ["/account", "/login", "/signup"] },
  ];
  return <nav className="mobile-nav" aria-label="모바일 주요 메뉴" data-usage-context="mobile">
    {links.map(({ href, label, icon: Icon, roots }) => <Link href={href} key={href} aria-current={roots.some((root) => isUserNavigationActive(pathname, root)) ? "page" : undefined}>
      <Icon size={20} aria-hidden="true" /><span>{label}</span>
    </Link>)}
  </nav>;
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
