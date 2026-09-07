import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ClipboardCheck, Gamepad2, LogIn, Search, ShieldCheck, Sparkles, UserRoundPlus } from "lucide-react";

import { getCurrentSession } from "@/modules/auth/infrastructure/runtime-session";

import styles from "../guide.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "시작하기",
  description: "내 계정 상태에 맞는 K-LOL.GG 내전 작업을 바로 시작합니다.",
  alternates: { canonical: "/start" },
};

export default async function StartPage() {
  const session = await getCurrentSession("ACCOUNT");
  const approved = session?.accountStatus === "APPROVED" && !session.mustChangePassword;

  return (
    <div className={`page-wrap ${styles.page}`}>
      <section className={styles.hero} aria-labelledby="start-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>QUICK START</p>
          <h1 id="start-title">지금 필요한 일부터<br />가볍게 시작해요</h1>
          <p>{session ? "현재 계정 상태에 맞는 작업만 골라 보여드려요." : "처음 방문했다면 플레이어를 찾아보고, 참가하려면 계정을 만들어 주세요."}</p>
        </div>
        <div className={styles.heroArt}>
          <Image src="/images/champions/lux-card.avif" alt="반짝이는 파스텔 하늘 아래의 럭스 비공식 AI 팬아트" fill priority sizes="(max-width: 860px) 100vw, 38vw" />
        </div>
      </section>

      <section className={styles.section} aria-labelledby="start-actions-title">
        <div className={styles.sectionHeading}>
          <div><h2 id="start-actions-title">추천 시작점</h2><p>{session ? `계정 상태: ${session.accountStatus}` : "로그인 없이도 공개 기록을 볼 수 있어요."}</p></div>
          <span className={styles.statusBadge} data-ready={approved}>{approved ? "참가 기능 사용 가능" : "공개 기능 사용 가능"}</span>
        </div>
        <div className={styles.cardGrid}>
          <Link className={styles.card} href="/players"><Search size={24} aria-hidden="true" /><strong>플레이어 찾기</strong><p>닉네임이나 Riot ID로 공개 프로필과 기록을 확인합니다.</p><small>누구나 이용 가능</small></Link>
          <Link className={styles.card} href="/matches"><Gamepad2 size={24} aria-hidden="true" /><strong>경기 결과 보기</strong><p>공개된 내전 결과와 세트별 점수, 참가 기록을 확인합니다.</p><small>누구나 이용 가능</small></Link>
          {approved ? (
            <Link className={styles.card} href="/matches/submit"><ClipboardCheck size={24} aria-hidden="true" /><strong>결과 접수 시작</strong><p>내 계정으로 경기 결과와 검토용 이미지를 안전하게 제출합니다.</p><small>승인 계정</small></Link>
          ) : session ? (
            <Link className={styles.card} href={session.mustChangePassword ? "/account/password" : "/account"}><ShieldCheck size={24} aria-hidden="true" /><strong>계정 상태 확인</strong><p>승인 상태와 필요한 비밀번호 변경, 연결 플레이어 정보를 확인합니다.</p><small>로그인 계정</small></Link>
          ) : (
            <Link className={styles.card} href="/signup"><UserRoundPlus size={24} aria-hidden="true" /><strong>참가 계정 만들기</strong><p>약관에 동의하고 플레이어 연결을 신청한 뒤 관리자 승인을 기다립니다.</p><small>회원가입</small></Link>
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
