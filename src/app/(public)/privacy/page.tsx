import type { Metadata } from "next";
import { UsagePreference } from "@/components/usage/usage-preference";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import styles from "@/components/accounts/account-access.module.css";
import { ACCOUNT_PRIVACY_VERSION } from "@/modules/accounts/domain/account-policies";

export const metadata: Metadata = {
  title: "개인정보 처리 안내",
  description: "K-LOL.GG 계정 데이터의 현재 수집·이용·보존 방식",
};

export default function PrivacyPage() {
  return <div className={styles.page}><article className={styles.policy}>
    <header><span className={styles.eyebrow}><ShieldCheck aria-hidden="true" /> PRIVACY NOTICE</span><h1>개인정보 처리 안내</h1><p>정책 식별자 {ACCOUNT_PRIVACY_VERSION} · 시행 2026년 9월 30일</p></header>
    <section><h2>1. 처리하는 정보</h2><p>가입 시 로그인 아이디, 비밀번호, 회원명, Riot ID, 약관·개인정보 안내 동의 시점과 버전을 처리합니다. 비밀번호 원문은 저장하지 않고 scrypt 해시만 저장합니다. V1 bcrypt 해시는 성공 로그인 때 안전하게 scrypt로 전환합니다.</p></section>
    <section><h2>2. 이용 목적</h2><p>계정 인증, 가입·플레이어 연결 검토, 승인과 이용 제한, 비밀번호 복구, 관리자 보안, 요청 속도 제한, 오류 조사와 변경 감사에 사용합니다.</p></section>
    <section><h2>3. 세션과 보안 기록</h2><p>일반 계정 세션은 최대 7일, 비밀번호로 로그인한 관리자 세션은 최대 30분의 별도 HttpOnly 쿠키로 유지합니다. DB에는 세션 토큰 원문 대신 해시, 만료·폐기 시각과 권한 버전을 저장합니다. 보안 변경 시 모든 세션을 폐기합니다.</p></section>
    <section><h2>4. 공개 범위</h2><p>일반 계정 API에는 비밀번호 해시, TOTP 정보, 내부 운영 사유, 회원명, 세션 토큰을 반환하지 않습니다. 회원명과 claim 비교 정보는 승인 업무를 수행하는 관리자 화면으로 제한합니다.</p></section>
    <section><h2>5. 보존과 삭제</h2><p>계정 삭제는 복구와 감사 일관성을 위해 소프트 삭제로 처리하며 플레이어 연결·상태 이력·감사 기록을 즉시 지우지 않습니다. 보존 기간과 완전 삭제 절차는 운영 정책과 관련 의무를 검토해 별도로 확정해야 합니다.</p></section>
    <section><h2>6. 복구 요청과 속도 제한</h2><p>비밀번호 복구 응답은 계정 존재 여부를 공개하지 않습니다. 로그인 아이디와 네트워크 식별값은 도메인 분리 HMAC으로 속도 제한 키를 만들며 원문 키를 저장하지 않습니다.</p></section>
    <section><h2>7. 문의와 정책 변경</h2><p>열람·정정·삭제 요청은 서버 운영 문의 채널로 접수합니다. 문서가 바뀌면 정책 식별자와 시행일을 갱신합니다. 정책 식별자는 사이트 기능 버전과 다르며, 현재 구체적인 담당자 연락처와 법정 보존 기간은 운영 전 확정이 필요합니다.</p></section>
    <aside className={styles.notice}>이 안내는 현재 구현을 정확히 설명하기 위한 초안입니다. 법적 적합성과 최종 보존 정책은 별도 법률 검토가 필요합니다.</aside>
    <section><h2>8. 방문·클릭 이용 통계</h2><p>이용 통계가 활성화된 경우 무작위 브라우저 식별 쿠키, 로그인 회원의 내부 계정 식별자, 페이지 유형, 일부 메뉴·기능 클릭과 수집 시각을 서비스 이용 현황 분석에 사용합니다. 검색어·닉네임·입력 내용·URL의 상세 식별자·원본 IP는 이 통계에 저장하지 않습니다. 쿠키는 최대 90일 유지하며, 통계 이벤트는 180일이 지난 뒤 수집 요청 시 분할 정리합니다. 수집이 중단되면 정리도 지연될 수 있습니다. 통계는 로그인한 관리자만 조회할 수 있습니다.</p><p>브라우저의 추적 거부 설정을 따릅니다. 아래 설정은 이 브라우저에 적용되며 이전에 수집된 기록을 삭제하지는 않습니다.</p><UsagePreference /></section>
    <p><Link href="/signup">가입 신청으로 돌아가기</Link> · <Link href="/terms">이용약관</Link></p>
  </article></div>;
}
