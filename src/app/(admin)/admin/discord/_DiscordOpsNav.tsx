import Link from "next/link";

type DiscordOpsNavKey = "overview" | "recruits" | "matches" | "stats" | "logs" | "diagnostics" | "settings";

const DISCORD_OPS_NAV: Array<{
  key: DiscordOpsNavKey;
  href: string;
  title: string;
  desc: string;
}> = [
  { key: "overview", href: "/admin/discord", title: "요약", desc: "전체 현황" },
  { key: "recruits", href: "/admin/discord/recruits", title: "구인", desc: "모임 검증" },
  { key: "matches", href: "/admin/discord/matches", title: "내전", desc: "참석/늦참" },
  { key: "stats", href: "/admin/discord/stats", title: "통계", desc: "체류/동행" },
  { key: "logs", href: "/admin/discord/logs", title: "로그", desc: "음성 이벤트" },
  { key: "diagnostics", href: "/admin/discord/diagnostics", title: "오류", desc: "자동화 점검" },
  { key: "settings", href: "/admin/discord/settings", title: "설정", desc: "감시/알림" },
];

export default function DiscordOpsNav({ active }: { active: DiscordOpsNavKey }) {
  return (
    <nav className="discord-ops-tabs" aria-label="Discord 운영 메뉴">
      {DISCORD_OPS_NAV.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          className={active === item.key ? "is-active" : ""}
          aria-current={active === item.key ? "page" : undefined}
        >
          <strong>{item.title}</strong>
          <span>{item.desc}</span>
        </Link>
      ))}
    </nav>
  );
}
