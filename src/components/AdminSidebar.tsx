import Link from "next/link";

const menuGroups = [
  {
    title: "내전 운영",
    items: [
      { href: "/players/balance", label: "팀 밸런스" },
      { href: "/admin/matches/new", label: "시즌 내전 등록" },
      { href: "/admin/matches", label: "시즌 내전 관리" },
    ],
  },
  {
    title: "대회 운영",
    items: [
      { href: "/admin/progress/event", label: "이벤트 내전 관리" },
      { href: "/admin/progress/destruction", label: "멸망전 관리" },
    ],
  },
  {
    title: "기초 데이터",
    items: [
      { href: "/admin/players", label: "플레이어 목록" },
      { href: "/admin/users", label: "플레이어 승인" },
      { href: "/admin/champions", label: "챔피언" },
      { href: "/admin/seasons", label: "시즌" },
    ],
  },
  {
    title: "콘텐츠",
    items: [
      { href: "/admin/notices", label: "공지사항" },
      { href: "/admin/event-notices", label: "이벤트 공지" },
      { href: "/admin/images", label: "우승 이미지" },
    ],
  },
  {
    title: "운영 기록",
    items: [
      { href: "/admin/logs", label: "관리자 로그" },
    ],
  },
];

export default function AdminSidebar() {
  return (
    <aside className="app-sidebar">
      <div className="app-sidebar__title">관리자</div>

      <nav className="app-sidebar__nav">
        {menuGroups.map((group) => (
          <div key={group.title} className="app-sidebar__group">
            <div className="app-sidebar__group-title">{group.title}</div>

            <div className="app-sidebar__group-items">
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="app-sidebar__link app-sidebar__link--compact"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}