"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ListChecks, Menu, Swords, Trophy, UserRound } from "lucide-react";

const navItems = [
  { href: "/app", label: "홈", icon: Home, exact: true },
  { href: "/app/recruits", label: "구인 현황", icon: ListChecks },
  { href: "/app/matches", label: "내전", icon: Swords },
  { href: "/app/rankings", label: "랭킹", icon: Trophy },
  { href: "/app/me", label: "내정보", icon: UserRound },
];

export function AppBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="klol-app-bottom-nav" aria-label="앱 하단 메뉴">
      <div className="klol-app-bottom-nav__inner">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href} data-active={active}>
              <Icon aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("klol:open-navigation"))}
          aria-label="전체 메뉴 열기"
        >
          <Menu aria-hidden="true" />
          <span>메뉴</span>
        </button>
      </div>
    </nav>
  );
}
