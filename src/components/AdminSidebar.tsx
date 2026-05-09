"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type AdminSidebarItem = {
  href: string;
  label: string;
  code: string;
  access?: "SUPER";
  external?: boolean;
};

type AdminSidebarGroup = {
  title: string;
  items: AdminSidebarItem[];
};

const menuGroups: AdminSidebarGroup[] = [
  {
    title: "내전 운영",
    items: [
      { href: "/admin/matches/new", label: "시즌 내전 등록", code: "REG" },
      { href: "/admin/matches", label: "시즌 내전 관리", code: "MAT" },
    ],
  },
  {
    title: "팀 밸런스",
    items: [
      { href: "/admin/balance", label: "팀 밸런스 계산", code: "BAL" },
      { href: "/admin/balance/drafts", label: "저장 밸런스", code: "DRF" },
    ],
  },
  {
    title: "AI 밸런스",
    items: [
      { href: "/admin/balance-ai", label: "AI 밸런스 대시보드", code: "AI" },
      { href: "/admin/balance-ai/reviews", label: "AI 리뷰 목록", code: "REV" },
      { href: "/admin/balance-ai/players", label: "AI MMR 랭킹", code: "MMR" },
      { href: "/admin/balance-ai/recalculate", label: "AI MMR 재계산", code: "CAL" },
    ],
  },
  {
    title: "운영 AI",
    items: [
      { href: "/admin/operation-ai", label: "운영 AI 보조", code: "OPS" },
    ],
  },
  {
    title: "대회 운영",
    items: [
      { href: "/admin/progress/event", label: "이벤트 내전 관리", code: "EVT" },
      { href: "/admin/progress/destruction", label: "멸망전 관리", code: "DES" },
    ],
  },
  {
    title: "기초 데이터",
    items: [
      { href: "/admin/players", label: "플레이어 목록", code: "PLY" },
      { href: "/admin/users", label: "플레이어 승인", code: "USR", access: "SUPER" },
      { href: "/admin/champions", label: "챔피언", code: "CHP" },
      { href: "/admin/seasons", label: "시즌", code: "SSN" },
    ],
  },
  {
    title: "콘텐츠",
    items: [
      { href: "/admin/notices", label: "공지사항", code: "NOT" },
      { href: "/admin/event-notices", label: "이벤트 공지", code: "EVN" },
      { href: "/admin/images", label: "우승 이미지", code: "IMG" },
      { href: "/admin/highlights", label: "하이라이트", code: "VID" },
    ],
  },
  {
    title: "운영 기록",
    items: [
      { href: "/admin/logs", label: "관리자 로그", code: "LOG" },
      { href: "/api/admin/backup/players.csv", label: "백업 CSV", code: "CSV", access: "SUPER", external: true },
    ],
  },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/admin") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="app-sidebar app-sidebar--admin" aria-label="관리자 메뉴">
      <div className="app-sidebar__title">관리자</div>
      <div className="app-sidebar__subtitle">운영 · 데이터 · 권한</div>

      <nav className="app-sidebar__nav">
        {menuGroups.map((group) => (
          <div key={group.title} className="app-sidebar__group">
            <div className="app-sidebar__group-title">{group.title}</div>

            <div className="app-sidebar__group-items">
              {group.items.map((item) => {
                const isActive = !item.external && isActivePath(pathname, item.href);
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
