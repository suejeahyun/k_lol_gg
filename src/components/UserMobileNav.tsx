"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type MobileNavItem = {
  href: string;
  label: string;
  code: string;
  match: string[];
};

const items: MobileNavItem[] = [
  { href: "/", label: "홈", code: "HOM", match: ["/"] },
  { href: "/recruit", label: "구인", code: "REC", match: ["/recruit", "/recruit-helper"] },
  { href: "/matches", label: "내전", code: "MAT", match: ["/matches"] },
  { href: "/rankings", label: "랭킹", code: "RNK", match: ["/rankings"] },
  { href: "/me/player", label: "내정보", code: "MY", match: ["/me", "/account"] },
];

function isActive(pathname: string, item: MobileNavItem) {
  if (item.href === "/") return pathname === "/";
  return item.match.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export default function UserMobileNav() {
  const pathname = usePathname();

  return (
    <nav className="user-mobile-nav" aria-label="모바일 주요 메뉴">
      {items.map((item) => {
        const active = isActive(pathname, item);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`user-mobile-nav__link${active ? " user-mobile-nav__link--active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <span className="user-mobile-nav__code">{item.code}</span>
            <span className="user-mobile-nav__label">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
