import Link from "next/link";
import { Coins, Dices, FolderOpen, Scale } from "lucide-react";

import styles from "./team-tools.module.css";

export type TeamToolPage = "balance" | "drafts" | "random" | "coin";

export function TeamToolNav({ current, approved }: { current: TeamToolPage; approved: boolean }) {
  return (
    <nav className={styles.toolNav} aria-label="팀 도구">
      <Link href="/tools/team-balance" data-active={current === "balance" ? "true" : undefined} aria-current={current === "balance" ? "page" : undefined}>
        <Scale size={17} aria-hidden="true" /> 팀 밸런스
      </Link>
      <Link href="/tools/random-team" data-active={current === "random" ? "true" : undefined} aria-current={current === "random" ? "page" : undefined}>
        <Dices size={17} aria-hidden="true" /> 랜덤 팀
      </Link>
      <Link href="/tools/coin-toss" data-active={current === "coin" ? "true" : undefined} aria-current={current === "coin" ? "page" : undefined}>
        <Coins size={17} aria-hidden="true" /> 코인 토스
      </Link>
      {approved ? (
        <Link href="/tools/team-balance/drafts" data-active={current === "drafts" ? "true" : undefined} aria-current={current === "drafts" ? "page" : undefined}>
          <FolderOpen size={17} aria-hidden="true" /> 팀 밸런스 초안
        </Link>
      ) : null}
    </nav>
  );
}
