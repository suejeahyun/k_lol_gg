import type { Metadata } from "next";
import Link from "next/link";
import { FileCheck2 } from "lucide-react";

import styles from "@/components/accounts/account-access.module.css";
import { ACCOUNT_TERMS_VERSION } from "@/modules/accounts/domain/account-policies";

export const metadata: Metadata = {
  title: "이용약관",
  description: "K-LOL.GG 계정과 서비스 이용에 관한 현재 운영 규칙",
};

export default function TermsPage() {
  return <div className={styles.page}><article className={styles.policy}>
    <header><span className={styles.eyebrow}><FileCheck2 aria-hidden="true" /> SERVICE TERMS</span><h1>이용약관</h1><p>정책 식별자 {ACCOUNT_TERMS_VERSION} · 시행 2026년 9월 12일</p></header>
    <section><h2>1. 적용 범위</h2><p>이 문서는 K-LOL.GG의 계정 가입, 승인, 로그인과 커뮤니티·운영 기능 이용에 적용됩니다.</p></section>
    <section><h2>2. 가입과 승인</h2><p>가입 시 로그인 아이디, 비밀번호, 회원명과 Riot ID를 입력합니다. 새 Riot ID로 만든 일반 사용자 계정은 가입 즉시 자동 승인됩니다. 이미 등록된 플레이어와 일치하는 Riot ID는 안전한 연결을 위해 PENDING으로 시작하며, 관리자 확인 전에는 계정 상태 확인, 로그아웃과 비밀번호 변경만 사용할 수 있습니다.</p></section>
    <section><h2>3. 플레이어 연결</h2><p>새 Riot ID는 신규 플레이어와 연결해 검토합니다. 이미 존재하지만 계정에 연결되지 않은 Riot ID는 즉시 가져오지 않고 수동 claim으로 보관합니다. 관리자 검토는 Riot 계정 소유권 검증을 뜻하지 않습니다.</p></section>
    <section><h2>4. 계정 상태와 운영 조치</h2><p>운영자는 신청을 승인·거절하거나 이용을 제한할 수 있고, 사용자에게 안내할 사유와 내부 운영 사유를 분리해 기록합니다. 역할·상태·비밀번호·삭제 변경은 세션 폐기와 감사 기록을 동반합니다.</p></section>
    <section><h2>5. 이용자의 의무</h2><p>타인의 Riot ID나 계정을 사칭하거나, 승인·복구·속도 제한을 우회하거나, 서비스와 다른 이용자에게 피해를 주는 자동화·공격을 시도해서는 안 됩니다.</p></section>
    <section><h2>6. 중단과 변경</h2><p>점검이나 장애로 일부 기능이 일시 중단될 수 있습니다. 중요한 정책 변경 시 새 정책 식별자와 시행일을 표시하고 필요한 경우 다시 동의를 받습니다. 이 식별자는 사이트 제품 버전과 별도로 관리됩니다.</p></section>
    <aside className={styles.notice}>이 초안은 현재 코드 동작을 설명하기 위한 운영 문서이며 별도의 법률 검토가 필요합니다.</aside>
    <p><Link href="/signup">가입 신청으로 돌아가기</Link> · <Link href="/privacy">개인정보 처리 안내</Link></p>
  </article></div>;
}
