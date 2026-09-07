import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { CircleOff, DatabaseZap, EyeOff, Link2, LockKeyhole, RefreshCw, ShieldCheck } from "lucide-react";

import styles from "../../guide.module.css";

export const metadata: Metadata = {
  title: "Riot 연동 도움말",
  description: "Riot 계정 연결, RSO 소유권 확인, 동기화 범위와 개인정보 보호 원칙을 안내합니다.",
  alternates: { canonical: "/help/riot" },
};

export default function RiotHelpPage() {
  return (
    <div className={`page-wrap ${styles.page}`}>
      <section className={styles.hero} aria-labelledby="riot-help-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>RIOT CONNECTION GUIDE</p>
          <h1 id="riot-help-title">내 Riot 계정은<br />내가 확인하고 연결해요</h1>
          <p>Riot ID를 연결하면 솔로 랭크 요약을 내 프로필에서 간편하게 확인할 수 있어요.</p>
        </div>
        <div className={styles.heroArt}><Image src="/images/champions/janna-card.avif" alt="맑은 바람을 일으키는 잔나 비공식 AI 팬아트" fill priority sizes="(max-width: 860px) 100vw, 38vw" /></div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <div><h2>현재 연동 상태</h2><p>공식 연동 준비 상태에 따라 계정 화면에서 이용 가능 여부를 안내합니다.</p></div>
          <span className={styles.statusBadge}><CircleOff size={13} aria-hidden="true" /> 현재 이용 제한</span>
        </div>
        <div className={styles.notice}><LockKeyhole size={19} aria-hidden="true" /><span>안전한 연동 준비가 끝나기 전에는 연결 버튼이 표시되지 않습니다.</span></div>
      </section>

      <section className={styles.section} aria-labelledby="riot-flow-title">
        <div className={styles.sectionHeading}><div><h2 id="riot-flow-title">연결 흐름</h2><p>기능이 열리면 아래 순서로 진행됩니다.</p></div></div>
        <ol className={styles.steps}>
          <li><div><strong>내 계정 확인</strong><span>로그인한 계정과 내 플레이어 프로필을 확인합니다.</span></div></li>
          <li><div><strong>Riot 계정 확인</strong><span>Riot ID를 입력하거나 공식 로그인으로 본인 계정임을 확인합니다.</span></div></li>
          <li><div><strong>솔로 랭크 기록 가져오기</strong><span>티어와 승패 기록을 가져오고 마지막 업데이트 시각을 표시합니다.</span></div></li>
          <li><div><strong>언제든 연결 해제</strong><span>내 계정 화면에서 연결을 끊고 기록 갱신을 중단할 수 있습니다.</span></div></li>
        </ol>
      </section>

      <section className={styles.section} aria-labelledby="riot-privacy-title">
        <div className={styles.sectionHeading}><div><h2 id="riot-privacy-title">공개되는 것과 숨기는 것</h2><p>프로필에 필요한 정보만 공개합니다.</p></div></div>
        <div className={styles.cardGrid}>
          <div className={styles.card}><Link2 size={24} aria-hidden="true" /><strong>공개 요약</strong><p>Riot ID, 솔로 랭크 티어·단계·LP, 승패 수, 마지막 동기화 시각만 표시합니다.</p></div>
          <div className={styles.card}><EyeOff size={24} aria-hidden="true" /><strong>항상 비공개</strong><p>로그인 정보, 인증 정보와 운영 메모는 공개하지 않습니다.</p></div>
          <div className={styles.card}><RefreshCw size={24} aria-hidden="true" /><strong>기록 새로고침</strong><p>일시적으로 가져오지 못한 기록은 잠시 후 다시 갱신할 수 있습니다.</p></div>
        </div>
        <div className={styles.actions}><Link className={styles.primary} href="/account"><ShieldCheck size={16} aria-hidden="true" /> 내 계정 확인</Link><Link className={styles.secondary} href="/privacy"><DatabaseZap size={16} aria-hidden="true" /> 개인정보 처리방침</Link></div>
      </section>
    </div>
  );
}
