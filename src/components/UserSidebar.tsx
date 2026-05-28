"use client";

import Link from "next/link";
import AuthSection from "./AuthSection";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type UserStatus = "PENDING" | "APPROVED" | "REJECTED";

type User = {
  userId: string;
  status: UserStatus;
};

type UserSidebarItem = {
  href: string;
  label: string;
  code: string;
  auth?: boolean;
  approvedOnly?: boolean;
  activePrefixes?: string[];
};

type UserSidebarGroup = {
  title: string;
  items: UserSidebarItem[];
};

const menuGroups: UserSidebarGroup[] = [
  {
    title: "LOBBY",
    items: [
      { href: "/", label: "홈", code: "HOM" },
      { href: "/players", label: "플레이어", code: "PLY" },
      { href: "/rankings", label: "랭킹", code: "RNK" },
    ],
  },
  {
    title: "PLAY",
    items: [
      { href: "/matches", label: "내전 목록", code: "MAT" },
      { href: "/recruit", label: "구인구직", code: "REC", activePrefixes: ["/recruit", "/recruit-helper"] },
      { href: "/progress", label: "이벤트/멸망전", code: "EVT" },
      { href: "/participation", label: "참가하기", code: "JOIN", auth: true, approvedOnly: true },
    ],
  },
  {
    title: "BALANCE AI",
    items: [
      { href: "/ai-balance", label: "AI 분석", code: "AI", activePrefixes: ["/ai-balance"] },
      { href: "/players/balance", label: "팀 밸런스", code: "BAL", auth: true, approvedOnly: true, activePrefixes: ["/players/balance"] },
      {
        href: "/players/balance/recommendations",
        label: "저장/밴픽",
        code: "P/B",
        auth: true,
        approvedOnly: true,
        activePrefixes: ["/players/balance/recommendations", "/players/balance/drafts"],
      },
    ],
  },
  {
    title: "INFO",
    items: [
      { href: "/notices", label: "공지사항", code: "NOT", activePrefixes: ["/notices", "/event-notices"] },
      { href: "/highlights", label: "하이라이트", code: "VID", activePrefixes: ["/highlights", "/images"] },
      { href: "/account/password", label: "비밀번호 변경", code: "PWD", auth: true },
    ],
  },
];

function isActivePath(pathname: string, item: UserSidebarItem) {
  if (item.href === "/") return pathname === item.href;

  if (item.href === "/players/balance") {
    return pathname === item.href;
  }

  if (item.activePrefixes?.length) {
    return item.activePrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  }

  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export default function UserSidebar() {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    async function fetchUser() {
      try {
        const res = await fetch("/api/auth/me", {
          cache: "no-store",
        });

        if (!res.ok) {
          setUser(null);
          return;
        }

        const data: { user: User | null } = await res.json();
        setUser(data.user ?? null);
      } catch (error: unknown) {
        console.error("[USER_SIDEBAR_AUTH_ERROR]", error);
        setUser(null);
      }
    }

    fetchUser().catch((error: unknown) => {
      console.error("[USER_SIDEBAR_AUTH_PROMISE_ERROR]", error);
      setUser(null);
    });
  }, [pathname]);

  const isLoggedIn = Boolean(user);
  const isApproved = user?.status === "APPROVED";

  return (
    <aside className="app-sidebar app-sidebar--user" aria-label="유저 메뉴">
      <div className="app-sidebar__top">
        <div className="app-sidebar__title">K-LOL.GG</div>
        <div className="app-sidebar__subtitle">내전 · 랭킹 · AI 데이터</div>

        <nav className="app-sidebar__nav">
          {menuGroups.map((group) => (
            <div key={group.title} className="app-sidebar__group">
              <div className="app-sidebar__group-title">{group.title}</div>

              <div className="app-sidebar__group-items">
                {group.items.map((item) => {
                  if (item.auth && !isLoggedIn) return null;
                  if (item.approvedOnly && !isApproved) return null;

                  const isActive = isActivePath(pathname, item);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`app-sidebar__link app-sidebar__link--compact${isActive ? " app-sidebar__link--active" : ""}`}
                      aria-current={isActive ? "page" : undefined}
                    >
                      <span className="app-sidebar__code">{item.code}</span>
                      <span className="app-sidebar__label">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>

      <div className="app-sidebar__bottom">
        <AuthSection />
      </div>
    </aside>
  );
}
