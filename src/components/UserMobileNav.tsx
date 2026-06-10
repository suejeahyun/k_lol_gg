"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type MobileNavItem = {
  href: string;
  label: string;
  code: string;
  match: string[];
};

type MobileNavUser = {
  userId: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  role?: "USER" | "ADMIN" | "SUPER_ADMIN" | string;
};

const baseItems: MobileNavItem[] = [
  { href: "/", label: "홈", code: "HOM", match: ["/"] },
  { href: "/recruit", label: "구인", code: "REC", match: ["/recruit", "/recruit-helper"] },
  { href: "/matches", label: "내전", code: "MAT", match: ["/matches"] },
  { href: "/rankings", label: "랭킹", code: "RNK", match: ["/rankings"] },
];

function isActive(pathname: string, item: MobileNavItem) {
  if (item.href === "/") return pathname === "/";
  return item.match.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export default function UserMobileNav() {
  const pathname = usePathname();
  const [user, setUser] = useState<MobileNavUser | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function fetchUser() {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (!res.ok) {
          if (mounted) setUser(null);
          return;
        }

        const data: { user: MobileNavUser | null } = await res.json();
        if (mounted) setUser(data.user ?? null);
      } catch (error: unknown) {
        console.error("[USER_MOBILE_NAV_AUTH_ERROR]", error);
        if (mounted) setUser(null);
      } finally {
        if (mounted) setChecked(true);
      }
    }

    fetchUser().catch((error: unknown) => {
      console.error("[USER_MOBILE_NAV_AUTH_PROMISE_ERROR]", error);
      if (mounted) {
        setUser(null);
        setChecked(true);
      }
    });

    return () => {
      mounted = false;
    };
  }, [pathname]);

  const authItem = useMemo<MobileNavItem>(() => {
    if (!checked || !user) {
      return {
        href: "/login",
        label: "로그인",
        code: "LOG",
        match: ["/login", "/signup", "/forgot-password"],
      };
    }

    return {
      href: "/account",
      label: "계정",
      code: user.status === "APPROVED" ? "ACC" : "CHK",
      match: ["/account", "/me", "/login", "/signup"],
    };
  }, [checked, user]);

  const items = [...baseItems, authItem];

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
