import type { Metadata } from "next";
import Link from "next/link";
import styles from "../help.module.css";

export const metadata: Metadata = { title: "모집 이용 안내", alternates: { canonical: "/help/recruits" } };

export default function RecruitHelpPage() {
  return <div className={`page-wrap ${styles.page}`}>
    <header className={styles.hero}>
      <span>RECRUIT GUIDE</span>
      <h1>파티·내전 모집 이용 안내</h1>
      <p>최신 명단 전체를 복사하고 이름과 필요한 라인을 적어 전송해주세요.</p>
    </header>
    <section className={styles.section}>
      <h2>카카오톡에서 복사·붙여넣기로 참가하기</h2>
      <ol>
        <li><strong>최근 봇 명단 전체를 복사</strong>합니다.</li>
        <li><strong>빈칸에 내 이름</strong>을 넣습니다. 사이트 회원이 아니어도 내전에 접수할 수 있어요.</li>
        <li><strong>메시지 전체를 전송</strong>하고 봇의 저장 결과를 확인합니다.</li>
      </ol>
      <p>참가할 때는 다른 사람 이름·시간·게임·양식코드를 그대로 두세요. 파티는 저장 후 현재 구인 목록이 나옵니다. 다음 참가자는 <strong>구인상세 번호</strong>로 최신 양식을 받아 복사하면 됩니다.</p>
      <p>협곡 내전의 신규·교체 참가자는 라인이 필요해요. <strong>이름/top,mid</strong> 또는 <strong>이름/all</strong>로 적어주세요. 칼바람·증바람은 이름만 입력하면 됩니다.</p>
      <p>내전은 이름으로 먼저 접수하며, 사이트 회원 연결 전에도 명단과 인원수에 포함됩니다. 사이트에 등록한 이름 또는 닉네임과 정확히 일치하는 활성 회원이 한 명이면 참가 명단에 자동 연결됩니다. 동명이인은 이름(사이트 닉네임)으로 구분해주세요. 로그인이나 계정 소유권 인증과는 별개입니다. 저장 후 봇이 보내는 최신 양식으로 다음 참가와 수정을 이어가세요.</p>
      <p>정원이 찼을 때 예비 참여를 원하면 예비 칸에 이름을 넣으세요. 저장되지 않았다는 안내가 나오면 봇이 보여 준 최신 명단에 다시 작성해 주세요.</p>
      <p>연결 오류가 나도 저장은 끝났을 수 있어요. 다시 보내기 전에 파티는 상세 번호, 내전은 내전상세 번호로 명단을 확인해 주세요.</p>
    </section>
    <section className={styles.section}>
      <h2>새 모집 만들기</h2>
      <p>함께할 사람을 새로 모을 때만 <strong>5인파티</strong>를 입력하세요. 빈 양식에 시간·게임과 첫 참가자 이름을 적어 전체 전송하면 됩니다. 시간·게임은 비워둘 수 있지만, <strong>처음 등록할 때는 이름이 한 명 이상</strong> 있어야 해요.</p>
      <p>아직 등록하지 않은 초안은 구인현황에 나오지 않아요. <strong>구인상세 번호</strong>로 다시 받고, 만들지 않을 때는 <strong>번호ㅉ</strong>로 초안을 취소하세요.</p>
      <p>내전은 <strong>내전구인</strong> 입력 후 종목을 선택하세요. <strong>내전구인 협곡</strong>, <strong>내전구인 칼바람</strong>, <strong>내전구인 증바람</strong>으로 바로 양식을 받을 수도 있습니다.</p>
      <p>양식코드가 있는 번호형 N인파티는 최신 양식에서 이름 추가·삭제·교체와 시작·게임 수정을 할 수 있어요. 모집번호·정원·종목·양식코드는 바꾸지 마세요.</p>
      <p>라인형 파티와 구형 양식에는 기존 편집 제한이 적용됩니다. 취소는 상세 번호 삭제 이름을 사용해주세요.</p>
      <p>내전 이름·라인·시간·안내도 최신 양식에서 수정할 수 있어요. 같은 항목을 다른 사람이 먼저 바꿨다면 최신 양식을 다시 받아 작성해주세요.</p>
      <p>사이트 신청은 본인이 사이트에서, 운영진 확정 항목은 운영진이 수정해야 합니다.</p>
    </section>
    <section className={styles.section}>
      <h2>명단 찾기·취소·마감</h2>
      <ul>
        <li><strong>구인현황</strong> 또는 <strong>내전현황</strong>에서 참여할 모집 번호를 찾습니다.</li>
        <li><strong>구인상세 12</strong>로 파티 전체 양식을 다시 받고, <strong>12ㅉ</strong>으로 모집을 마감합니다.</li>
        <li><strong>내전상세 12</strong>로 내전 전체 양식을 다시 받고, <strong>내전 12ㅉ</strong>으로 모집을 마감합니다.</li>
        <li>취소는 <strong>상세 12 삭제 내이름</strong> 또는 <strong>내전상세 12 삭제 내이름</strong>을 입력합니다. 편집 가능한 최신 N인파티·내전 양식에서는 번호 행을 남기고 이름만 비운 뒤 전체 전송할 수도 있어요.</li>
        <li>파티의 <strong>상세 12 추가 내이름</strong> 같은 빠른 명령도 사용할 수 있습니다.</li>
      </ul>
      <p>명령 앞에는 <strong>/</strong>를 붙여도 됩니다.</p>
    </section>
    <section className={styles.section}>
      <h2>사이트에서 확인하기</h2>
      <ol>
        <li><strong>파티 모집</strong>에서 게임 종류, 현재 인원, 참여자 이름·포지션과 예정 시간을 확인합니다.</li>
        <li>종료·취소된 모집은 목록에서 제외되며 현재 참여 가능한 모집이 먼저 표시됩니다.</li>
      </ol>
      <p>카카오 스크림 모집 기능은 제외되었으며, 기존 저장 기록의 조회는 유지됩니다.</p>
    </section>
    <section className={styles.section}>
      <h2>모집 등록 안내</h2>
      <ul>
        <li>승인된 계정으로 로그인하면 모집을 등록하고 관리할 수 있습니다.</li>
        <li>같은 요청이 반복되어도 모집은 한 번만 등록됩니다.</li>
        <li>모집에 작성한 참여자 표시 이름, 포지션과 예비 여부는 현재 모집 카드에 공개됩니다.</li>
        <li>로그인 ID, 연락처, 방·발신자 식별값과 운영 메모는 공개하지 않습니다.</li>
      </ul>
    </section>
    <p className={styles.notice}>카카오톡에서는 봇이 출력한 최신 양식을 사용하고, 사이트에서는 모집 내용이 바뀌었을 때 목록을 새로고침해 주세요.</p>
    <nav className={styles.links}>
      <Link href="/recruits">현재 모집 보기</Link>
      <Link href="/help/kakao">카카오 봇 안내</Link>
    </nav>
  </div>;
}
