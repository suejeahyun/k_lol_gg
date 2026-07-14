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

type PublicSiteSettings = {
  siteName?: string;
  siteTagline?: string | null;
  siteLogoUrl?: string | null;
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
      { href: "/players", label: "플레이어", code: "PLY" },
      { href: "/rankings", label: "랭킹", code: "RNK" },
    ],
  },
  {
    title: "PLAY",
    items: [
      { href: "/matches", label: "내전 목록", code: "MAT" },
      { href: "/recruit", label: "구인현황", code: "REC", activePrefixes: ["/recruit", "/recruit-helper"] },
      { href: "/progress", label: "이벤트/멸망전", code: "EVT" },
    ],
  },
  {
    title: "BALANCE AI",
    items: [
      { href: "/ai-balance", label: "K-LOL MMR", code: "MMR", activePrefixes: ["/ai-balance"] },
      { href: "/players/balance", label: "팀 밸런스", code: "BAL", auth: true, approvedOnly: true, activePrefixes: ["/players/balance"] },

      {
        href: "/players/balance/recommendations",
        label: "밴픽 추천",
        code: "P/B",
        auth: true,
        approvedOnly: true,
        activePrefixes: ["/players/balance/recommendations", "/players/balance/drafts"],
      },
            { 
        href: "/random-team", 
        label: "랜덤 팀 나누기", 
        code: "RND", 
        activePrefixes: ["/random-team"] 
      },
    ],
  },
  {
    title: "INFO",
    items: [
      { href: "/highlights", label: "하이라이트", code: "VID", activePrefixes: ["/highlights", "/images"] },
      { href: "/riot-api", label: "Riot API 안내", code: "RIT", activePrefixes: ["/riot-api", "/me/riot"] },
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
  const [siteName, setSiteName] = useState("K-LOL.GG");
  const [siteTagline, setSiteTagline] = useState("내전 · 랭킹 · AI 데이터");
  const [siteLogoUrl, setSiteLogoUrl] = useState<string | null>(null);

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

  useEffect(() => {
    async function fetchSiteSettings() {
      try {
        const res = await fetch("/api/site-settings", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { settings?: PublicSiteSettings };
        if (data.settings?.siteName) setSiteName(data.settings.siteName);
        setSiteTagline(data.settings?.siteTagline || "내전 · 랭킹 · AI 데이터");
        setSiteLogoUrl(data.settings?.siteLogoUrl ?? null);
      } catch {
        setSiteName("K-LOL.GG");
        setSiteTagline("내전 · 랭킹 · AI 데이터");
        setSiteLogoUrl(null);
      }
    }

    fetchSiteSettings();
  }, []);

  const isLoggedIn = Boolean(user);
  const isApproved = user?.status === "APPROVED";

  return (
    <aside className="app-sidebar app-sidebar--user" aria-label="유저 메뉴">
      <div className="app-sidebar__top">
        <div className="app-sidebar__title app-sidebar__title--brand">
          {siteLogoUrl ? (
            <span
              className="app-brand-logo app-brand-logo--sidebar"
              aria-hidden="true"
              style={{ backgroundImage: `url("${siteLogoUrl}")` }}
            />
          ) : null}
          <span>{siteName}</span>
        </div>
        <div className="app-sidebar__subtitle">{siteTagline}</div>

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

