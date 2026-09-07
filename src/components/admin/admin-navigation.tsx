"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpenCheck,
  Bot,
  CalendarDays,
  Gamepad2,
  LayoutDashboard,
  Menu,
  MessageCircleMore,
  Scale,
  Search,
  Sparkles,
  Trophy,
  Users,
  X,
} from "lucide-react";
import {
  ADMIN_WORKSPACES,
  isAdminWorkspaceActive,
  type AdminWorkspaceIconKey,
} from "@/modules/admin/domain/admin-workspaces";
import { AdminLogoutButton } from "./admin-logout-button";
import styles from "./admin-shell.module.css";

const icons = {
  dashboard: LayoutDashboard,
  people: Users,
  seasons: CalendarDays,
  matches: Gamepad2,
  balance: Scale,
  tournaments: Trophy,
  community: MessageCircleMore,
  content: Sparkles,
  integrations: Bot,
  operations: BookOpenCheck,
} satisfies Record<AdminWorkspaceIconKey, typeof LayoutDashboard>;

function WorkspaceLinks({ closeMenu }: { closeMenu?: () => void }) {
  const pathname = usePathname();
  return ADMIN_WORKSPACES.map((workspace) => {
    const Icon = icons[workspace.icon];
    const active = isAdminWorkspaceActive(pathname, workspace.href);
    return (
      <Link
        aria-current={active ? "page" : undefined}
        href={workspace.href}
        key={workspace.id}
        onClick={closeMenu}
      >
        <Icon aria-hidden="true" />
        <span>{workspace.label}</span>
      </Link>
    );
  });
}

export function AdminWorkspaceNavigation() {
  return <nav aria-label="관리자 작업 공간" className={styles.nav}><WorkspaceLinks /></nav>;
}

export function MobileAdminNavigation({ roleLabel }: { roleLabel: string }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const current = ADMIN_WORKSPACES.find((workspace) => isAdminWorkspaceActive(pathname, workspace.href));
  const workHref = current && current.id !== "home" ? current.href : "/admin/players";

  return (
    <>
      {menuOpen ? (
        <div className={styles.mobileMenu} id="admin-mobile-menu">
          <header><strong>전체 작업 공간</strong><button type="button" onClick={() => setMenuOpen(false)} aria-label="메뉴 닫기"><X aria-hidden="true" /></button></header>
          <nav aria-label="모바일 관리자 작업 공간"><WorkspaceLinks closeMenu={() => setMenuOpen(false)} /></nav>
          <div className={styles.mobileAccount}>
            <span><small>현재 역할</small><strong>{roleLabel}</strong></span>
            <AdminLogoutButton />
          </div>
        </div>
      ) : null}
      <nav className={styles.mobileBottom} aria-label="모바일 관리자 바로가기">
        <Link href="/admin" aria-current={pathname === "/admin" ? "page" : undefined}><LayoutDashboard aria-hidden="true" /><span>홈</span></Link>
        <Link href={workHref}><Scale aria-hidden="true" /><span>작업</span></Link>
        <Link href="/admin/search" aria-current={pathname === "/admin/search" ? "page" : undefined}><Search aria-hidden="true" /><span>검색</span></Link>
        <button type="button" aria-controls="admin-mobile-menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}><Menu aria-hidden="true" /><span>메뉴</span></button>
      </nav>
    </>
  );
}
