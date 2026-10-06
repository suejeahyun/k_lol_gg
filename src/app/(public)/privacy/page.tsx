import { createRouteMetadata } from "@/modules/seo/domain/site-seo";
import { UsagePreference } from "@/components/usage/usage-preference";
import Link from "next/link";

import styles from "@/components/accounts/account-access.module.css";
import { ACCOUNT_PRIVACY_VERSION } from "@/modules/accounts/domain/account-policies";

export const metadata = createRouteMetadata("/privacy");

export default function PrivacyPage() {
  return <div className={styles.page}><article className={styles.policy}>
    <header><h1>개인정보 처리 안내</h1><p>정책 식별자 {ACCOUNT_PRIVACY_VERSION} · 시행 2026년 10월 2일</p></header>
    <section><h2>1. 처리하는 정보</h2><p>가입 시 로그인 아이디, 비밀번호, 회원명, Riot ID, 약관·개인정보 안내 동의 시점과 버전을 처리합니다. 비밀번호 원문은 저장하지 않고 scrypt 해시만 저장합니다.</p></section>
    <section><h2>2. 이용 목적</h2><p>계정 인증, 가입·플레이어 연결 검토, 승인과 이용 제한, 비밀번호 복구, 관리자 보안, 요청 속도 제한, 오류 조사와 변경 감사에 사용합니다.</p></section>
    <section><h2>3. 세션과 보안 기록</h2><p>일반 계정 세션은 최대 7일, 비밀번호로 로그인한 관리자 세션은 최대 30분의 별도 HttpOnly 쿠키로 유지합니다. DB에는 세션 토큰 원문 대신 해시, 만료·폐기 시각과 권한 버전을 저장합니다. 보안 변경 시 모든 세션을 폐기합니다.</p></section>
    <section><h2>4. 공개 범위</h2><p>일반 계정 API에는 비밀번호 해시, TOTP 정보, 내부 운영 사유, 회원명, 세션 토큰을 반환하지 않습니다. 회원명과 claim 비교 정보는 승인 업무를 수행하는 관리자 화면으로 제한합니다.</p></section>
    <section><h2>5. 보존과 삭제</h2><p>계정 정보는 서비스 이용 중 인증과 기록 연결을 위해 보관합니다. 탈퇴·삭제는 운영팀 문의에서 요청할 수 있습니다. 요청자 확인 후 로그인과 세션·연동을 중지하고 직접 식별정보를 제거합니다. 공동 경기 결과는 다른 참가자의 기록을 위해 삭제된 참여자로 표시하며, 개인을 식별하지 않는 통계와 관계 참조는 남을 수 있습니다. 단순 계정 비활성화와 개인정보 삭제는 다릅니다. 외부 카카오톡·Discord·Riot 서비스의 원본 정보는 해당 서비스에서 별도로 요청해야 합니다.</p></section>
    <section><h2>6. 복구 요청과 속도 제한</h2><p>비밀번호 복구 응답은 계정 존재 여부를 공개하지 않습니다. 로그인 아이디와 네트워크 식별값은 도메인 분리 HMAC으로 속도 제한 키를 만들며 원문 키를 저장하지 않습니다.</p></section>
    <section><h2>7. 문의와 정책 변경</h2><p>서비스 운영 및 개인정보 요청 창구는 K-LOL.GG 운영팀입니다. 열람·정정·삭제·처리정지·동의 철회 요청은 아래 사이트 문의로 접수할 수 있습니다. 본인 확인에 필요한 사항은 접수 후 개별 안내하며 비밀번호나 인증 코드를 요구하지 않습니다. 처리 범위와 결과는 입력한 연락 방법으로 안내합니다. 문서가 바뀌면 정책 식별자와 시행일을 갱신합니다.</p></section>
    <p><Link href="/help/contact">개인정보 요청·운영팀 문의 접수</Link></p><section><h2>사이트 문의의 수집과 보관</h2><p>문의 처리, 답변과 후속 문의 확인을 위해 동의를 받아 닉네임, 연락 방법, 문의 종류·내용, 접수 시각을 보관합니다. 내용은 공개하지 않으며 운영 담당 관리자만 확인합니다. 신규 사이트 문의는 접수 후 180일이 지나면 매일 정리 작업 및 문의 접수·관리 조회 시 삭제합니다. 작업 장애 시 정리가 지연될 수 있으며 운영팀이 재처리합니다. 문의 본문과 연락 방법은 변경 감사 기록에 복제하지 않습니다. 더 이른 삭제도 문의로 요청할 수 있습니다.</p></section>
    <section><h2>8. 방문·클릭 이용 통계</h2><p>이용 통계가 활성화된 경우 무작위 브라우저 식별 쿠키, 로그인 회원의 내부 계정 식별자, 페이지 유형, 일부 메뉴·기능 클릭과 수집 시각을 서비스 이용 현황 분석에 사용합니다. 검색어·닉네임·입력 내용·URL의 상세 식별자·원본 IP는 이 통계에 저장하지 않습니다. 쿠키는 최대 90일 유지하며, 통계 이벤트는 180일이 지난 뒤 수집 요청 시 분할 정리합니다. 수집이 중단되면 정리도 지연될 수 있습니다. 통계는 로그인한 관리자만 조회할 수 있습니다.</p><p>브라우저의 추적 거부 설정을 따릅니다. 아래 설정은 이 브라우저에 적용되며 이전에 수집된 기록을 삭제하지는 않습니다.</p><UsagePreference /></section>
    <p><Link href="/signup">가입 신청으로 돌아가기</Link> · <Link href="/terms">이용약관</Link></p>
  </article></div>;
}
