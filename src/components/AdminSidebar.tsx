"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

type AdminSidebarItem = {
  href: string;
  label: string;
  code: string;
  access?: "SUPER";
  external?: boolean;
  activePrefixes?: string[];
};

type AdminSidebarGroup = {
  title: string;
  items: AdminSidebarItem[];
};

type PublicSiteSettings = {
  siteName?: string;
  siteLogoUrl?: string | null;
};

const menuGroups: AdminSidebarGroup[] = [
  {
    title: "오늘 운영",
    items: [
      { href: "/admin/matches", label: "내전 관리", code: "MAT", activePrefixes: ["/admin/matches"] },
      { href: "/admin/progress", label: "이벤트/멸망전", code: "EVT", activePrefixes: ["/admin/progress"] },
      { href: "/admin/kakao/recruits", label: "구인 관리", code: "REC", activePrefixes: ["/admin/kakao/recruits"] },
      { href: "/admin/kakao/scrims", label: "스크림구인", code: "SCR", activePrefixes: ["/admin/kakao/scrims"] },
      { href: "/admin/kakao/season-apply", label: "내전 참가신청", code: "APP", activePrefixes: ["/admin/kakao/season-apply"] },
    ],
  },
  {
    title: "회원/징계",
    items: [
      { href: "/admin/players", label: "회원/플레이어", code: "PLY", activePrefixes: ["/admin/players", "/admin/users"] },
      { href: "/admin/discipline", label: "주의/경고/벤", code: "DIS", activePrefixes: ["/admin/discipline"] },
      { href: "/admin/kakao/operation-forms", label: "운영신청", code: "OPR", activePrefixes: ["/admin/kakao/operation-forms"] },
      { href: "/admin/users", label: "계정 목록", code: "USR", activePrefixes: ["/admin/users"] },
    ],
  },
  {
    title: "자동화",
    items: [
      { href: "/admin/kakao", label: "카카오톡 요약", code: "KAK", activePrefixes: ["/admin/kakao"] },
      { href: "/admin/logs/kakao", label: "카카오톡 로그", code: "RLG", activePrefixes: ["/admin/logs/kakao"] },
      { href: "/admin/riot", label: "Riot 연동", code: "RIT", activePrefixes: ["/admin/riot"] },
      { href: "/admin/balance-ai", label: "K-LOL MMR", code: "MMR", activePrefixes: ["/admin/balance-ai"] },
      { href: "/admin/ai-requests", label: "AI 로그", code: "AIL", activePrefixes: ["/admin/ai-requests"] },
    ],
  },
  {
    title: "콘텐츠",
    items: [
      { href: "/admin/balance/drafts", label: "AI 밸런스", code: "AIB", activePrefixes: ["/admin/balance/drafts", "/admin/balance/recommendations"] },
      { href: "/admin/highlights", label: "하이라이트", code: "VID", activePrefixes: ["/admin/highlights"] },
      { href: "/admin/images", label: "이미지", code: "IMG", activePrefixes: ["/admin/images"] },
    ],
  },
  {
    title: "시스템",
    items: [
      { href: "/admin/site-settings", label: "사이트 설정", code: "STE", access: "SUPER", activePrefixes: ["/admin/site-settings"] },
      { href: "/admin/kakao/settings", label: "카카오톡 설정", code: "SET", activePrefixes: ["/admin/kakao/settings", "/admin/kakao/recruits/settings"] },
      { href: "/admin/security", label: "보안 설정", code: "SEC", activePrefixes: ["/admin/security"] },
      { href: "/admin/seasons", label: "시즌", code: "SSN", activePrefixes: ["/admin/seasons"] },
      { href: "/admin/champions", label: "챔피언", code: "CHP", activePrefixes: ["/admin/champions"] },
      { href: "/admin/logs", label: "감사 로그", code: "AUD", activePrefixes: ["/admin/logs"] },
      { href: "/api/admin/backup/players.csv", label: "백업 CSV", code: "CSV", access: "SUPER", external: true },
    ],
  },
];

function isActivePath(pathname: string, item: AdminSidebarItem) {
  if (["/admin", "/admin/kakao", "/admin/kakao/recruits"].includes(item.href)) return pathname === item.href;

  if (item.activePrefixes?.length) {
    return item.activePrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  }

  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export default function AdminSidebar() {
  const pathname = usePathname();
  const [canViewSuper, setCanViewSuper] = useState(false);
  const [siteName, setSiteName] = useState("K-LOL.GG");
  const [siteLogoUrl, setSiteLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store" });
        if (!response.ok) return;

        const data = (await response.json()) as {
          user?: { role?: string; status?: string };
        };

        if (!cancelled) {
          setCanViewSuper(
            data.user?.role === "SUPER_ADMIN" && data.user?.status === "APPROVED",
          );
        }
      } catch {
        if (!cancelled) setCanViewSuper(false);
      }
    }

    loadSession();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    async function loadSiteSettings() {
      try {
        const response = await fetch("/api/site-settings", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { settings?: PublicSiteSettings };
        if (data.settings?.siteName) setSiteName(data.settings.siteName);
        setSiteLogoUrl(data.settings?.siteLogoUrl ?? null);
      } catch {
        setSiteName("K-LOL.GG");
        setSiteLogoUrl(null);
      }
    }

    loadSiteSettings();
  }, []);

  return (
    <aside className="app-sidebar app-sidebar--admin" aria-label="관리자 메뉴">
      <div className="app-sidebar__title app-sidebar__title--brand">
        {siteLogoUrl ? (
          <span
            className="app-brand-logo app-brand-logo--sidebar"
            aria-hidden="true"
            style={{ backgroundImage: `url("${siteLogoUrl}")` }}
          />
        ) : null}
        <span>관리자</span>
      </div>
      <div className="app-sidebar__subtitle">{siteName} · 운영</div>

      <nav className="app-sidebar__nav">
        {menuGroups.map((group) => (
          <div key={group.title} className="app-sidebar__group">
            <div className="app-sidebar__group-title">{group.title}</div>

            <div className="app-sidebar__group-items">
              {group.items
                .filter((item) => item.access !== "SUPER" || canViewSuper)
                .map((item) => {
                  const isActive = !item.external && isActivePath(pathname, item);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`app-sidebar__link app-sidebar__link--compact${isActive ? " app-sidebar__link--active" : ""}`}
                      aria-current={isActive ? "page" : undefined}
                      target={item.external ? "_blank" : undefined}
                      rel={item.external ? "noreferrer" : undefined}
                    >
                      <span className="app-sidebar__code">{item.code}</span>
                      <span className="app-sidebar__label">{item.label}</span>
                      {item.access === "SUPER" ? (
                        <span className="app-sidebar__access">SUPER</span>
                      ) : null}
                    </Link>
                  );
                })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
