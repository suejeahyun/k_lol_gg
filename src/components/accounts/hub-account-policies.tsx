import Link from "next/link";
import { HUB_ACCOUNT_PRIVACY_VERSION, HUB_ACCOUNT_TERMS_VERSION } from "@/modules/accounts/domain/account-policies";
import styles from "./account-access.module.css";

export function HubTerms() {
  return <div className={styles.page}><article className={styles.policy}>
    <header><h1>GG HUB 이용약관</h1><p>{HUB_ACCOUNT_TERMS_VERSION} · 시행 2026년 10월 29일</p></header>
    <section><h2>계정과 커뮤니티 개설</h2><p>GG HUB 가입에는 로그인 아이디와 비밀번호가 필요합니다. 일반 회원으로 가입되며 커뮤니티 개설 신청은 운영팀의 검토와 승인 후 진행됩니다. 가입이나 신청만으로 관리자 권한이 생기지 않습니다.</p></section>
    <section><h2>커뮤니티별 권한과 기록</h2><p>GG HUB 계정과 각 커뮤니티의 회원 자격·운영 권한은 별도로 관리합니다. 다른 커뮤니티의 소속이나 기록이 가입만으로 합쳐지거나 공개되지 않습니다. 연결 로그인에서 계정 제공 범위와 해당 커뮤니티의 가입 조건을 확인해 주세요.</p></section>
    <section><h2>이용 규칙</h2><p>타인의 계정을 사칭하거나 접근 제한을 우회해서는 안 됩니다. 개설 신청에는 사용할 권한이 있는 이름과 이미지를 등록하고 정확한 운영 정보를 제공해야 합니다. 운영팀은 신청을 반려하거나 서비스 이용을 제한할 수 있으며 사유 확인과 문의 경로를 제공합니다.</p></section>
    <section><h2>중단·변경·문의</h2><p>점검과 장애로 일부 기능이 중단될 수 있습니다. 중요한 정책 변경은 새 식별자와 시행일로 안내합니다. 계정 복구·이용 제한·탈퇴 문의는 <Link href="/help/contact">GG HUB 운영팀</Link>에 접수할 수 있습니다.</p></section>
    <p><Link href="/signup">회원가입</Link> · <Link href="/privacy">개인정보 처리 안내</Link></p>
  </article></div>;
}

export function HubPrivacy() {
  return <div className={styles.page}><article className={styles.policy}>
    <header><h1>GG HUB 개인정보 처리 안내</h1><p>{HUB_ACCOUNT_PRIVACY_VERSION} · 시행 2026년 10월 29일</p></header>
    <section><h2>계정 정보와 목적</h2><p>로그인 아이디, 비밀번호 해시, 약관·개인정보 안내 동의 시점과 버전을 계정 인증·복구·운영 권한 확인에 사용합니다. 허브 가입에는 Riot ID나 게임 프로필을 요구하지 않습니다. 비밀번호 원문은 저장하지 않습니다.</p></section>
    <section><h2>개설 신청과 로그인 연결</h2><p>신청자의 계정 식별자와 커뮤니티 설정·검토 이력을 개설과 운영 관리에 사용합니다. 새 커뮤니티 로그인에 동의하면 중앙 계정의 고유 식별자를 대상 사이트에 전달해 그 사이트의 별도 계정과 연결합니다. 중앙 비밀번호나 다른 사이트의 운영 권한·경기 기록은 전달하지 않습니다.</p></section>
    <section><h2>공개 범위와 보안</h2><p>공개를 위해 등록한 커뮤니티 소개와 실제 공개된 사이트 정보 외의 계정·신청 검토 자료는 본인과 권한 있는 운영자에게 제한합니다. 일반 계정 세션은 최대 7일, 관리자 세션은 최대 30분의 별도 HttpOnly 쿠키를 사용합니다. 서버에는 세션 원문 대신 해시·만료·폐기 시각을 저장하고 보안 변경 시 세션을 폐기합니다.</p></section>
    <section><h2>복구와 문의</h2><p>복구 요청은 계정 존재 여부를 공개하지 않습니다. 로그인 아이디·네트워크 식별값은 비밀키로 변환한 속도 제한 값으로 사용합니다. 문의를 접수하면 닉네임·연락 방법·내용을 담당 운영자가 확인하며, 접수 후 180일이 지난 문의는 정리 작업과 접수·관리 조회 시 삭제합니다. 장애가 있으면 정리가 지연될 수 있습니다.</p></section>
    <section><h2>계정 보관과 요청</h2><p>계정은 서비스 이용 중 인증과 신청·운영 기록 연결을 위해 보관합니다. 본인의 열람·정정·삭제·탈퇴 요청은 <Link href="/help/contact">GG HUB 운영팀</Link>에 접수해 주세요. 요청자 확인 후 처리 범위와 결과를 안내하며, 각 커뮤니티가 원본을 관리하는 기록은 해당 운영팀에도 요청할 수 있습니다. 단순 계정 비활성화는 개인정보 삭제와 다릅니다.</p></section>
    <p><Link href="/signup">회원가입</Link> · <Link href="/terms">이용약관</Link></p>
  </article></div>;
}
