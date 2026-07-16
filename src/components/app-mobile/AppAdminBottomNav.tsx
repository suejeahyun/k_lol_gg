"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck, ListChecks, Swords, Trophy, UsersRound } from "lucide-react";

const adminNavItems = [
  { href: "/app/admin", label: "홈", icon: ShieldCheck, exact: true },
  { href: "/app/admin/recruits", label: "구인", icon: ListChecks },
  { href: "/app/admin/matches", label: "내전", icon: Swords },
  { href: "/app/matches?tab=events", activePrefix: "/app/matches", label: "진행", icon: Trophy },
  { href: "/app/admin/users", label: "유저", icon: UsersRound },
];

export function AppAdminBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="klol-app-bottom-nav klol-app-bottom-nav--admin" aria-label="앱 관리자 하단 메뉴">
      <div className="klol-app-bottom-nav__inner">
        {adminNavItems.map((item) => {
          const Icon = item.icon;
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.activePrefix ?? item.href);
          return (
            <Link key={item.href} href={item.href} data-active={active}>
              <Icon aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
