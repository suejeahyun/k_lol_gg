import { createRouteMetadata } from "@/modules/seo/domain/site-seo";
import Image from "next/image";
import Link from "next/link";
import { ClipboardCheck, Gamepad2, LogIn, Search, ShieldCheck, Sparkles, UserRoundPlus } from "@/components/theme/theme-icons";

import { getCurrentSession } from "@/modules/auth/infrastructure/runtime-session";

import styles from "../guide.module.css";

export const dynamic = "force-dynamic";
export const metadata = createRouteMetadata("/start");

export default async function StartPage() {
  const session = await getCurrentSession("ACCOUNT");
  const approved = session?.accountStatus === "APPROVED" && !session.mustChangePassword;

  return (
    <div className={`page-wrap ${styles.page}`}>
      <section className={styles.hero} aria-labelledby="start-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>QUICK START</p>
          <h1 id="start-title">지금 필요한 일부터<br />가볍게 시작해요</h1>
          <p>{session ? "하려는 일을 고르면 필요한 화면으로 바로 이동해요." : "처음 방문했다면 플레이어를 찾아보고, 참가하려면 계정을 만들어 주세요."}</p>
        </div>
        <div className={styles.heroArt}>
          <Image src="/images/champions/lux-card.avif" alt="반짝이는 파스텔 하늘 아래의 럭스 비공식 AI 팬아트" fill priority sizes="(max-width: 860px) 100vw, 38vw" />
        </div>
      </section>

      <section className={styles.section} aria-labelledby="start-actions-title">
        <div className={styles.sectionHeading}>
          <div><h2 id="start-actions-title">추천 시작점</h2><p>{session ? `계정 상태: ${{ APPROVED: "승인됨", PENDING: "승인 대기", REJECTED: "승인 거절", SUSPENDED: "이용 제한" }[session.accountStatus]}` : "로그인 없이도 공개 기록을 볼 수 있어요."}</p></div>
          <span className={styles.statusBadge} data-ready={approved}>{approved ? "참가 기능 사용 가능" : "공개 기능 사용 가능"}</span>
        </div>
        <div className={styles.cardGrid}><Link className={styles.card} href="/applications"><strong>오늘 내전 신청</strong><p>모집 회차와 내 신청 상태를 확인하고 참가합니다.</p></Link><Link className={styles.card} href="/recruits"><strong>파티 찾아 참여하기</strong><p>현재 모집을 고르고 카카오톡 참여 방법을 확인합니다.</p></Link><Link className={styles.card} href="/tools/team-balance"><strong>실력 맞춰 팀 나누기</strong><p>참가자 10명을 선택하고 팀 후보를 만듭니다.</p></Link>
          <Link className={styles.card} href="/players"><Search size={24} aria-hidden="true" /><strong>플레이어 찾기</strong><p>닉네임이나 Riot ID로 공개 프로필과 기록을 확인합니다.</p><small>누구나 이용 가능</small></Link>
          <Link className={styles.card} href="/matches"><Gamepad2 size={24} aria-hidden="true" /><strong>경기 결과 보기</strong><p>공개된 내전 결과와 세트별 점수, 참가 기록을 확인합니다.</p><small>누구나 이용 가능</small></Link>
          {approved ? (
            <Link className={styles.card} href="/matches/submit"><ClipboardCheck size={24} aria-hidden="true" /><strong>경기 결과 제출</strong><p>내 계정으로 경기 결과와 검토용 이미지를 안전하게 제출합니다.</p><small>승인 계정</small></Link>
          ) : session ? (
            <Link className={styles.card} href={session.mustChangePassword ? "/account/password" : "/account"}><ShieldCheck size={24} aria-hidden="true" /><strong>계정 상태 확인</strong><p>승인 상태와 필요한 비밀번호 변경, 연결 플레이어 정보를 확인합니다.</p><small>로그인 계정</small></Link>
          ) : (
            <Link className={styles.card} href="/signup"><UserRoundPlus size={24} aria-hidden="true" /><strong>참가 계정 만들기</strong><p>약관에 동의하고 새 플레이어 계정을 만들면 자동 승인됩니다.</p><small>회원가입</small></Link>
          )}
        </div>
        <div className={styles.actions}>
          {!session ? <Link className={styles.primary} href="/login?next=%2Fstart"><LogIn size={16} aria-hidden="true" /> 로그인</Link> : <Link className={styles.primary} href="/account"><Sparkles size={16} aria-hidden="true" /> 내 계정</Link>}
          <Link className={styles.secondary} href="/applications">참가 신청 보기</Link>
          {session?.role === "ADMIN" || session?.role === "SUPER_ADMIN" ? <Link className={styles.secondary} href="/admin">관리자 작업 공간</Link> : null}
        </div>
      </section>
    </div>
  );
}
