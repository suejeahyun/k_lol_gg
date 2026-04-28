import Link from "next/link";

const menuGroups = [
  {
    title: "내전",
    items: [
      { href: "/admin/matches/new", label: "등록" },
      { href: "/admin/matches", label: "관리" },
    ],
  },
  {
    title: "시즌 · 이벤트 · 멸망전" ,
    items: [
      { href: "/admin/seasons", label: "시즌" },
      { href: "/admin/progress/event", label: "이벤트" },
      { href: "/admin/progress/destruction", label: "멸망전" },
    ],
  },
  {
    title: "데이터",
    items: [
      { href: "/admin/champions", label: "챔피언" },
      { href: "/admin/images", label: "우승 이미지" },
    ],
  },
  {
    title: "운영",
    items: [
      { href: "/admin/notices", label: "공지사항" },
      { href: "/admin/event-notices", label: "이벤트 공지" },
    ],
  },
    {
    title: "플레이어",
    items: [
      { href: "/admin/users", label: "플레이어 승인" },
      { href: "/admin/players", label: "플레이어 목록" },
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