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

const menuGroups: AdminSidebarGroup[] = [
  {
    title: "CORE",
    items: [
      { href: "/admin/matches", label: "내전 관리", code: "MAT" },
    ],
  },
  {
    title: "BALANCE",
    items: [
      { href: "/admin/balance/drafts", label: "AI 밸런스", code: "AIB", activePrefixes: ["/admin/balance/drafts"] },
      { href: "/admin/balance-ai", label: "K-LOL MMR", code: "MMR", activePrefixes: ["/admin/balance-ai"] },
    ],
  },
  {
    title: "OPERATE",
    items: [
      { href: "/admin/recruits", label: "구인현황", code: "REC" },
      { href: "/admin/operation-forms", label: "운영 신청", code: "OPR", activePrefixes: ["/admin/operation-forms"] },
      { href: "/admin/discipline", label: " 경고 관리", code: "DIS", activePrefixes: ["/admin/discipline"] },
      { href: "/admin/discord", label: "Discord 운영", code: "DC", activePrefixes: ["/admin/discord", "/admin/discord-monitor"] },
      { href: "/admin/progress", label: "이벤트/멸망전", code: "EVT", activePrefixes: ["/admin/progress"] },
    ],
  },
  {
    title: "DATA",
    items: [
      { href: "/admin/players", label: "플레이어 관리", code: "PLY", activePrefixes: ["/admin/players"] },
      { href: "/admin/champions", label: "챔피언", code: "CHP" },
      { href: "/admin/seasons", label: "시즌", code: "SSN" },
    ],
  },
  {
    title: "CONTENT",
    items: [      { href: "/admin/highlights", label: "하이라이트", code: "VID" },
    ],
  },
  {
    title: "SYSTEM",
    items: [
      { href: "/admin/security", label: "보안 설정", code: "SEC", activePrefixes: ["/admin/security"] },
      { href: "/api/admin/backup/players.csv", label: "백업 CSV", code: "CSV", access: "SUPER", external: true },
    ],
  },
];

function isActivePath(pathname: string, item: AdminSidebarItem) {
  if (item.href === "/admin") return pathname === item.href;

  if (item.href === "/admin/balance") {
    return pathname === item.href;
  }

  if (item.activePrefixes?.length) {
    return item.activePrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  }

  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export default function AdminSidebar() {
  const pathname = usePathname();
  const [canViewSuper, setCanViewSuper] = useState(false);

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

  return (
    <aside className="app-sidebar app-sidebar--admin" aria-label="관리자 메뉴">
      <div className="app-sidebar__title">관리자</div>
      <div className="app-sidebar__subtitle">운영 · 데이터 · 권한</div>

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



