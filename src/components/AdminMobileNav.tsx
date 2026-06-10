"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type AdminMobileNavItem = {
  href: string;
  label: string;
  code: string;
  match: string[];
};

const adminMobileItems: AdminMobileNavItem[] = [
  { href: "/admin", label: "홈", code: "ADM", match: ["/admin"] },
  { href: "/admin/recruits", label: "구인", code: "REC", match: ["/admin/recruits"] },
  { href: "/admin/matches", label: "내전", code: "MAT", match: ["/admin/matches"] },
  { href: "/admin/discord", label: "디코", code: "DC", match: ["/admin/discord", "/admin/discord-monitor"] },
  { href: "/admin/users", label: "유저", code: "USR", match: ["/admin/users", "/admin/player-approvals"] },
];

function isActive(pathname: string, item: AdminMobileNavItem) {
  if (item.href === "/admin") return pathname === "/admin";
  if (item.href === "/admin/matches") return pathname === "/admin/matches" || pathname.startsWith("/admin/matches/");
  return item.match.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export default function AdminMobileNav() {
  const pathname = usePathname();

  return (
    <nav className="admin-mobile-nav" aria-label="관리자 모바일 주요 메뉴">
      {adminMobileItems.map((item) => {
        const active = isActive(pathname, item);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`admin-mobile-nav__link${active ? " admin-mobile-nav__link--active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <span className="admin-mobile-nav__code">{item.code}</span>
            <span className="admin-mobile-nav__label">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
