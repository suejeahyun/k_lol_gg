import type { CSSProperties } from "react";
import Link from "next/link";
import { SERVICE_BRAND } from "@/lib/service-brand";
import { getCurrentSession } from "@/modules/auth/infrastructure/runtime-session";
import { readRuntimeCommunitySiteConfiguration } from "@/modules/community-sites/infrastructure/runtime-site-configuration";
import { communityAccentForeground, type CommunityModuleId } from "@/modules/community-sites/domain/site-configuration";
import styles from "./managed-community.module.css";

const navigation: readonly { href: string; label: string; module: CommunityModuleId }[] = [
  { href: "/players", label: "선수", module: "members" },
  { href: "/recruits", label: "모집", module: "recruiting" }, { href: "/competitions", label: "대회", module: "competitions" },
  { href: "/matches", label: "경기", module: "matches" }, { href: "/rankings", label: "랭킹", module: "rankings" },
  { href: "/tools/team-balance", label: "팀 편성", module: "teamBalance" }, { href: "/images", label: "갤러리", module: "media" },
  { href: "/highlights", label: "하이라이트", module: "media" }, { href: "/help/kakao", label: "카카오 안내", module: "kakaoHelp" },
];

export async function ManagedCommunityShell({ children }: { children: React.ReactNode }) {
  let runtime;
  try { runtime = await readRuntimeCommunitySiteConfiguration(); } catch { /* An unavailable configuration is distinct from an empty site. */ }
  if (!runtime) return <main className={styles.unavailable}><h1>{SERVICE_BRAND.name}</h1><h2>사이트 설정을 확인할 수 없습니다</h2><p>연결을 복구한 뒤 다시 시도해 주세요.</p><Link href="/">홈으로 이동</Link></main>;
  const { configuration: config } = runtime;
  const session = await getCurrentSession("ACCOUNT");
  return <div className={styles.surface} data-community-template={config.templateId} style={{ "--community-accent": config.primaryColor, "--community-on-accent": communityAccentForeground(config.primaryColor) } as CSSProperties}>
    <a className={styles.skip} href="#community-content">본문으로 이동</a>
    <header className={styles.header}><Link className={styles.brand} href="/">
      {config.logoUrl ? /* eslint-disable-next-line @next/next/no-img-element -- User-provided HTTPS assets load directly without an arbitrary server image proxy. */
        <img src={config.logoUrl} alt="" width={42} height={42} referrerPolicy="no-referrer" /> : <span aria-hidden="true">{Array.from(config.name)[0]}</span>}
      <strong>{config.name}</strong></Link>
      <nav className={styles.navigation} aria-label="커뮤니티 메뉴">{navigation.filter((item) => config.modules[item.module]).map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}</nav>
      <div className={styles.account}><Link href={session ? "/account" : "/login"}>{session ? "내 계정" : "로그인"}</Link><Link href="/admin/login">운영진</Link></div>
    </header>
    <div id="community-content" tabIndex={-1}>{children}</div>
    <footer className={styles.footer}><strong>{config.name}</strong><p>{config.description}</p><div><Link href="/help/contact">문의</Link><Link href="/terms">이용약관</Link><Link href="/privacy">개인정보 처리 안내</Link></div><small>Riot Games가 승인하거나 후원하는 서비스가 아닙니다.</small></footer>
  </div>;
}
