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
          <p>직접 입력 또는 RSO 소유권 확인 뒤 공개 가능한 솔랭 요약만 표시하며, 내부 식별자와 요청 로그는 공개하지 않습니다.</p>
        </div>
        <div className={styles.heroArt}><Image src="/images/champions/janna-card.avif" alt="맑은 바람을 일으키는 잔나 비공식 AI 팬아트" fill priority sizes="(max-width: 860px) 100vw, 38vw" /></div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <div><h2>현재 연동 상태</h2><p>실제 Riot 운영 API나 운영 계정에는 연결하지 않습니다.</p></div>
          <span className={styles.statusBadge}><CircleOff size={13} aria-hidden="true" /> 운영 연동 잠금</span>
        </div>
        <div className={styles.notice}><LockKeyhole size={19} aria-hidden="true" /><span>V2는 현재 안전한 로컬·가짜 adapter 계약을 검증하는 단계입니다. 운영 API 승인과 별도 환경 설정이 확인되기 전에는 연결·동기화 버튼을 활성화하지 않습니다.</span></div>
      </section>

      <section className={styles.section} aria-labelledby="riot-flow-title">
        <div className={styles.sectionHeading}><div><h2 id="riot-flow-title">연결 흐름</h2><p>기능이 열리면 아래 순서로 진행됩니다.</p></div></div>
        <ol className={styles.steps}>
          <li><div><strong>승인된 내 계정 확인</strong><span>로그인 계정과 연결 플레이어의 소유 관계를 서버 트랜잭션에서 다시 확인합니다.</span></div></li>
          <li><div><strong>직접 연결 또는 RSO 확인</strong><span>Riot ID를 입력하거나, 만료 시간과 일회성 state가 있는 RSO 흐름으로 소유권을 확인합니다.</span></div></li>
          <li><div><strong>솔랭 요약 동기화</strong><span>요청 제한·시간 초과·부분 성공을 구분해 재시도하며 마지막 동기화 시각을 함께 표시합니다.</span></div></li>
          <li><div><strong>언제든 연결 해제</strong><span>연결을 끊으면 저장된 내부 식별자 암호문을 제거하고 공개 요약 갱신을 중단합니다.</span></div></li>
        </ol>
      </section>

      <section className={styles.section} aria-labelledby="riot-privacy-title">
        <div className={styles.sectionHeading}><div><h2 id="riot-privacy-title">공개되는 것과 숨기는 것</h2><p>공개 DTO는 필요한 값만 allowlist합니다.</p></div></div>
        <div className={styles.cardGrid}>
          <div className={styles.card}><Link2 size={24} aria-hidden="true" /><strong>공개 요약</strong><p>Riot ID, 솔로 랭크 티어·단계·LP, 승패 수, 마지막 동기화 시각만 표시합니다.</p></div>
          <div className={styles.card}><EyeOff size={24} aria-hidden="true" /><strong>항상 비공개</strong><p>PUUID, 계정 소유자 ID, 세션·토큰, 요청 로그와 관리자 메모는 브라우저로 보내지 않습니다.</p></div>
          <div className={styles.card}><RefreshCw size={24} aria-hidden="true" /><strong>안전한 재시도</strong><p>429와 일시 장애는 제한된 횟수만 재시도하고, 영구 실패와 구분해 운영자가 확인합니다.</p></div>
        </div>
        <div className={styles.actions}><Link className={styles.primary} href="/account"><ShieldCheck size={16} aria-hidden="true" /> 내 계정 확인</Link><Link className={styles.secondary} href="/privacy"><DatabaseZap size={16} aria-hidden="true" /> 개인정보 처리방침</Link></div>
      </section>
    </div>
  );
}
