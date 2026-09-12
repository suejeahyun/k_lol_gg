import type { ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, KeyRound, Radio, ShieldCheck, UsersRound } from "lucide-react";

import styles from "./account-access.module.css";

type AccountTab = "overview" | "player" | "discipline" | "riot" | "password";

const tabs: ReadonlyArray<Readonly<{ id: AccountTab; href: string; label: string; icon: typeof ShieldCheck }>> = [
  { id: "overview", href: "/account", label: "상태", icon: ShieldCheck },
  { id: "player", href: "/account?tab=player", label: "Riot ID·티어 변경", icon: UsersRound },
  { id: "discipline", href: "/account/discipline", label: "경고·증빙", icon: AlertTriangle },
  { id: "riot", href: "/account/riot", label: "Riot 전적 연동", icon: Radio },
  { id: "password", href: "/account/password", label: "비밀번호", icon: KeyRound },
];

export function AccountShell({ activeTab, title, description, status, action, children }: Readonly<{
  activeTab: AccountTab;
  title: string;
  description: string;
  status?: Readonly<{ label: string; state?: string }>;
  action?: ReactNode;
  children: ReactNode;
}>) {
  return <div className={styles.page}>
    <header className={styles.accountHero}>
      <div><span className={styles.eyebrow}><ShieldCheck aria-hidden="true" /> 내 계정</span><h1>{title}</h1><p>{description}</p></div>
      {(status || action) ? <div className={styles.accountHeroActions}>{status ? <span className={styles.status} data-state={status.state}>{status.label}</span> : null}{action}</div> : null}
    </header>
    <nav className={styles.tabs} aria-label="계정 메뉴">{tabs.map((tab) => { const Icon = tab.icon; return <Link href={tab.href} aria-current={activeTab === tab.id ? "page" : undefined} key={tab.id}><Icon aria-hidden="true" /> {tab.label}</Link>; })}</nav>
    {children}
  </div>;
}
