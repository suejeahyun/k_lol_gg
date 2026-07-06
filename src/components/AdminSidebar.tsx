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
    title: "핵심 운영",
    items: [
      { href: "/admin/matches", label: "내전 관리", code: "MAT", activePrefixes: ["/admin/matches"] },
      { href: "/admin/progress", label: "이벤트/멸망전", code: "EVT", activePrefixes: ["/admin/progress"] },
      { href: "/admin/operation-forms", label: "운영 신청", code: "OPR", activePrefixes: ["/admin/operation-forms"] },
      {
        href: "/admin/operation-forms/warnings",
        label: "주의/경고 관리",
        code: "DIS",
        activePrefixes: ["/admin/operation-forms/warnings", "/admin/discipline"],
      },
    ],
  },
  {
    title: "카카오톡",
    items: [
      { href: "/admin/kakao", label: "카카오톡 요약", code: "KAK", activePrefixes: ["/admin/kakao"] },
      { href: "/admin/recruits", label: "구인 관리", code: "REC", activePrefixes: ["/admin/recruits"] },
      { href: "/admin/recruits/logs", label: "구인 기록", code: "RLG", activePrefixes: ["/admin/recruits/logs"] },
      { href: "/admin/recruits/settings", label: "구인 설정", code: "RST", activePrefixes: ["/admin/recruits/settings"] },
      { href: "/admin/kakao/scrims", label: "스크림 구인", code: "SCR", activePrefixes: ["/admin/kakao/scrims"] },
      { href: "/admin/kakao/season-apply", label: "내전 참가신청", code: "APP", activePrefixes: ["/admin/kakao/season-apply"] },
      { href: "/admin/kakao/settings", label: "카카오톡 설정", code: "SET", activePrefixes: ["/admin/kakao/settings", "/admin/kakao/recruits/settings"] },
    ],
  },
  {
    title: "디스코드",
    items: [
      { href: "/admin/discord", label: "디스코드 요약", code: "DC", activePrefixes: ["/admin/discord"] },
      { href: "/admin/discord/bot", label: "봇 상태", code: "BOT", activePrefixes: ["/admin/discord/bot", "/admin/discord/diagnostics"] },
      { href: "/admin/discord/voice", label: "음성방 모니터", code: "VOC", activePrefixes: ["/admin/discord/voice"] },
      { href: "/admin/discord/recruits", label: "구인 검증", code: "DCR", activePrefixes: ["/admin/discord/recruits"] },
      { href: "/admin/discord/matches", label: "내전 출석", code: "ATM", activePrefixes: ["/admin/discord/matches"] },
      { href: "/admin/logs/discord", label: "디스코드 로그", code: "STA", activePrefixes: ["/admin/logs/discord"] },
      { href: "/admin/discord/settings", label: "설정", code: "SET", activePrefixes: ["/admin/discord/settings"] },
    ],
  },
  {
    title: "데이터",
    items: [
      { href: "/admin/players", label: "회원/플레이어", code: "PLY", activePrefixes: ["/admin/players", "/admin/users", "/admin/player-approvals"] },
      { href: "/admin/riot", label: "Riot 연동", code: "RIT", activePrefixes: ["/admin/riot"] },
      { href: "/admin/seasons", label: "시즌 전환", code: "SSN", activePrefixes: ["/admin/seasons"] },
    ],
  },
  {
    title: "AI/콘텐츠",
    items: [
      { href: "/admin/balance-ai", label: "K-LOL 랭킹", code: "MMR", activePrefixes: ["/admin/balance-ai"] },
      { href: "/admin/highlights", label: "하이라이트 관리", code: "VID", activePrefixes: ["/admin/highlights"] },
    ],
  },
  {
    title: "시스템",
    items: [
      { href: "/admin/security", label: "보안 설정", code: "SEC", activePrefixes: ["/admin/security"] },
      { href: "/admin/logs", label: "감사 로그", code: "AUD", activePrefixes: ["/admin/logs"] },
      { href: "/api/admin/backup/players.csv", label: "백업 CSV", code: "CSV", access: "SUPER", external: true },
    ],
  },
];

function isActivePath(pathname: string, item: AdminSidebarItem) {
  if (["/admin", "/admin/kakao", "/admin/recruits", "/admin/discord"].includes(item.href)) return pathname === item.href;

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
      <div className="app-sidebar__subtitle">운영 · 카카오톡 · 디스코드</div>

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
