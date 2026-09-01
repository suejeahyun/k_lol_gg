"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useRef } from "react";
import {
  CalendarCheck2,
  Home,
  LogIn,
  Menu,
  Search,
  Sparkles,
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

function openDialog(dialog: HTMLDialogElement | null, initialFocus?: HTMLElement | null) {
  if (!dialog || dialog.open) return;
  dialog.showModal();
  if (initialFocus) window.requestAnimationFrame(() => initialFocus.focus());
}

function closeDialog(dialog: HTMLDialogElement | null) {
  if (dialog?.open) dialog.close();
}

function SearchControl({ compact = false }: { compact?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const inputId = useId();

  return (
    <>
      <button
        className={compact ? "mobile-nav__action" : "header-icon-action"}
        type="button"
        aria-haspopup="dialog"
        aria-label="플레이어 검색 열기"
        onClick={() => openDialog(dialog.current, input.current)}
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
              <span>PLAYER SEARCH</span>
              <h2 id={titleId}>플레이어를 찾아볼까요?</h2>
            </div>
            <button type="button" aria-label="검색 닫기" onClick={() => closeDialog(dialog.current)}>
              <X size={20} aria-hidden="true" />
            </button>
          </div>

          <form className="global-search-form" action="/players" method="get">
            <label htmlFor={inputId}>닉네임 또는 Riot ID</label>
            <div>
              <Search size={19} aria-hidden="true" />
              <input
                ref={input}
                id={inputId}
                name="q"
                type="search"
                maxLength={80}
                placeholder="예: 닉네임 또는 GameName#TAG"
                autoComplete="off"
              />
              <button type="submit">검색</button>
            </div>
          </form>
          <p className="user-dialog__hint">
            계정 아이디·회원명·Discord 식별자는 검색 대상이 아니며 결과에도 표시하지 않습니다.
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
            바로 사용할 수 있는 기능은 링크로, 다음 파동에서 구현할 기능은 준비 중으로 구분했습니다.
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
                            <span>페이지 상태 구현</span>
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
          aria-current={isUserNavigationActive(pathname, item.href) ? "page" : undefined}
        >
          {item.href === "/" ? (
            <Home size={16} aria-hidden="true" />
          ) : item.href === "/players" ? (
            <UsersRound size={16} aria-hidden="true" />
          ) : (
            <CalendarCheck2 size={16} aria-hidden="true" />
          )}
          {item.label}
        </Link>
      ))}
      <span className="desktop-nav__planned" aria-label="경기 기능 준비 중">경기</span>
      <span className="desktop-nav__planned" aria-label="랭킹 기능 준비 중">랭킹</span>
      <span className="desktop-nav__planned" aria-label="대회 기능 준비 중">대회</span>
    </nav>
  );
}

export function HeaderUserControls() {
  return (
    <div className="header-actions">
      <SearchControl />
      <AllMenuControl />
      <Link className="header-account" href="/login" aria-label="사용자 로그인">
        <UserRound size={17} aria-hidden="true" />
        <span>로그인</span>
      </Link>
    </div>
  );
}

export function MobileUserNavigation() {
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
      <SearchControl compact />
      <Link href="/login" aria-current={pathname === "/login" ? "page" : undefined}>
        <LogIn size={20} aria-hidden="true" />
        <span>로그인</span>
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
