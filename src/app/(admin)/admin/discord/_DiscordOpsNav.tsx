import Link from "next/link";

const items = [
  { href: "/admin/discord", key: "overview", label: "요약", desc: "전체 현황" },
  { href: "/admin/discord/settings", key: "settings", label: "설정", desc: "감시/알림" },
  { href: "/admin/discord/recruits", key: "recruits", label: "구인", desc: "모임 검증" },
  { href: "/admin/discord/matches", key: "matches", label: "내전", desc: "참석/늦참" },
  { href: "/admin/discord/diagnostics", key: "diagnostics", label: "오류", desc: "자동화 점검" },
  { href: "/admin/discord/logs", key: "logs", label: "로그", desc: "음성 이벤트" },
  { href: "/admin/discord/stats", key: "stats", label: "통계", desc: "체류/동행" },
];

export default function DiscordOpsNav({ active }: { active?: string }) {
  return (
    <nav className="discord-ops-tabs" aria-label="Discord 운영 메뉴">
      {items.map((item) => (
        <Link key={item.key} className={`discord-ops-tab ${active === item.key ? "is-active" : ""}`} href={item.href}>
          <strong>{item.label}</strong>
          <span>{item.desc}</span>
        </Link>
      ))}
    </nav>
  );
}
