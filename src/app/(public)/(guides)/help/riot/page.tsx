import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { DatabaseZap, EyeOff, Link2, LockKeyhole, RefreshCw, ShieldCheck } from "lucide-react";

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
          <div><h2>공개 전적 연결과 본인 인증</h2><p>내 계정의 Riot 화면에서 현재 이용 가능한 연결 방식을 확인합니다.</p></div>
          <span className={styles.statusBadge}><Link2 size={13} aria-hidden="true" /> 연결 방식 구분</span>
        </div>
        <div className={styles.notice}><LockKeyhole size={19} aria-hidden="true" /><span>직접 연결은 등록된 Riot ID의 공개 전적을 가져오는 기능입니다. 계정 소유권을 확인하는 Riot 로그인은 별도 승인 준비가 필요하며, 준비 중에는 선택할 수 없습니다.</span></div>
      </section>

      <section className={styles.section} aria-labelledby="riot-flow-title">
        <div className={styles.sectionHeading}><div><h2 id="riot-flow-title">연결 흐름</h2><p>승인된 내 플레이어의 Riot ID를 확인한 뒤 연결합니다.</p></div></div>
        <ol className={styles.steps}>
          <li><div><strong>내 계정 확인</strong><span>로그인한 계정과 내 플레이어 프로필을 확인합니다.</span></div></li>
          <li><div><strong>공개 전적 연결</strong><span>플레이어에 등록된 Riot ID와 같은 게임 이름·태그를 입력합니다. 직접 연결만으로 계정 소유권이 인증되지는 않습니다.</span></div></li>
          <li><div><strong>솔로 랭크 기록 가져오기</strong><span>티어와 승패 기록을 가져오고 마지막 업데이트 시각을 표시합니다.</span></div></li>
          <li><div><strong>언제든 연결 해제</strong><span>내 계정 화면에서 연결을 끊고 기록 갱신을 중단할 수 있습니다.</span></div></li>
        </ol>
      </section>

      <section className={styles.section} aria-labelledby="riot-privacy-title">
        <div className={styles.sectionHeading}><div><h2 id="riot-privacy-title">공개되는 것과 숨기는 것</h2><p>프로필에 필요한 정보만 공개합니다.</p></div></div>
        <div className={styles.cardGrid}>
          <div className={styles.card}><Link2 size={24} aria-hidden="true" /><strong>공개 요약</strong><p>Riot ID, 솔로 랭크 티어·단계·LP와 승패, 최근 솔로 경기 요약 및 마지막 동기화 시각을 표시합니다.</p></div>
          <div className={styles.card}><EyeOff size={24} aria-hidden="true" /><strong>항상 비공개</strong><p>로그인 정보, 인증 정보와 운영 메모는 공개하지 않습니다.</p></div>
          <div className={styles.card}><RefreshCw size={24} aria-hidden="true" /><strong>기록 새로고침</strong><p>연결한 계정은 순서대로 갱신합니다. 내 Riot 계정 화면에서도 동기화를 요청할 수 있으며, API 제한이나 대기 상황에 따라 시간이 걸릴 수 있습니다.</p></div>
        </div>
        <div className={styles.actions}><Link className={styles.primary} href="/account/riot"><ShieldCheck size={16} aria-hidden="true" /> 내 Riot 계정 확인</Link><Link className={styles.secondary} href="/privacy"><DatabaseZap size={16} aria-hidden="true" /> 개인정보 처리방침</Link></div>
      </section>
    </div>
  );
}
