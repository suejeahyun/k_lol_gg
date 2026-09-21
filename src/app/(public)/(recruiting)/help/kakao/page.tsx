import type { Metadata } from "next";
import Link from "next/link";
import styles from "../help.module.css";
import { SiteFeatureStatePanel } from "@/components/site-feature-state";
import { readSiteFeatureState, siteFeatureLabel } from "@/modules/operations/infrastructure/site-feature-access";

export const metadata: Metadata = { title: "카카오 봇 연동 안내", alternates: { canonical: "/help/kakao" } };

export default async function KakaoHelpPage() {
  const featureState = await readSiteFeatureState("kakaoHelp");
  if (featureState !== "enabled") return <div className={`page-wrap ${styles.page}`}><SiteFeatureStatePanel label={siteFeatureLabel("kakaoHelp")} state={featureState} /></div>;
  return <div className={`page-wrap ${styles.page}`}>
    <header className={styles.hero}>
      <span>KAKAO BOT</span>
      <h1>최신 명단으로 참가하고 수정해요</h1>
      <p>최근 봇 명단 전체 복사 → 이름과 필요한 라인 입력 → 전체 전송. 봇의 저장 결과를 확인해주세요.</p>
    </header>
    <section className={styles.section}>
      <h2>복사·붙여넣기로 참가하기</h2>
      <ol>
        <li><strong>최근 봇 명단 전체를 복사</strong>합니다. 참가하려면 새 모집을 만들 필요가 없어요.</li>
        <li><strong>빈칸에 내 이름</strong>을 넣습니다. 사이트 회원이 아니어도 내전에 접수할 수 있어요.</li>
        <li><strong>메시지 전체를 전송</strong>한 뒤 봇의 저장 결과를 확인합니다. 파티는 저장 후 현재 구인 목록이 나옵니다. 다음 참가자는 <strong>구인상세 번호</strong>로 최신 양식을 받아 복사해요.</li>
      </ol>
      <p>참가할 때는 다른 사람 이름·시간·게임·모집 번호·양식코드를 그대로 두세요. 인원수는 봇이 계산합니다.</p>
      <p>협곡 내전의 신규·교체 참가자는 라인이 필요해요. <strong>이름/top,mid</strong> 또는 <strong>이름/all</strong>로 적어주세요. 칼바람·증바람은 이름만 입력하면 됩니다.</p>
      <p>내전은 이름으로 먼저 접수하며, 사이트 회원 연결 전에도 명단과 인원수에 포함됩니다. 사이트에 등록한 이름과 같아도 자동으로 계정을 연결하지 않아요. 운영진이 회원을 확인한 뒤 연결합니다. 동명이인은 이름(닉네임)으로 구분해주세요.</p>
    </section>
    <section className={styles.section}>
      <h2>명단이 안 보이나요?</h2>
      <ul>
        <li><strong>파티</strong>: <strong>구인현황</strong> → 원하는 번호 확인 → <strong>구인상세 9</strong></li>
        <li><strong>내전</strong>: <strong>내전현황</strong> → 원하는 번호 확인 → <strong>내전상세 9</strong></li>
      </ul>
      <p>정원이 찼다면 원하는 경우에만 예비 칸에 이름을 넣으세요. 저장되지 않았다는 안내가 나오면 함께 표시된 최신 명단에 다시 작성하면 됩니다.</p>
      <p>연결 오류가 나도 저장은 끝났을 수 있어요. 다시 보내기 전에 파티는 상세 번호, 내전은 내전상세 번호로 명단을 확인해 주세요.</p>
    </section>
    <section className={styles.section}>
      <h2>새로 모집하는 사람만</h2>
      <ol>
        <li>파티는 <strong>5인파티</strong>를 입력합니다. 내전은 <strong>내전구인</strong> 입력 후 종목을 선택하거나 <strong>내전구인 협곡</strong>처럼 종목까지 입력하세요.</li>
        <li>파티는 빈 양식에 시간·게임과 첫 참가자 이름을 적습니다. 시간·게임은 비워둘 수 있지만, <strong>처음 등록할 때는 이름이 한 명 이상</strong> 있어야 해요. 내전은 선택한 종목을 확인하고 협곡이면 이름과 라인을 적어주세요.</li>
        <li>메시지 전체를 전송해 모집을 시작합니다. 내전은 현재 사이트의 모집 정보와 연결됩니다.</li>
      </ol>
      <p>양식코드가 있는 번호형 N인파티는 최신 양식에서 이름 추가·삭제·교체와 시작·게임 수정을 할 수 있어요. 모집번호·정원·종목·양식코드는 바꾸지 마세요.</p>
      <p>아직 등록하지 않은 초안은 구인현황에 나오지 않아요. <strong>구인상세 번호</strong>로 다시 받고, 만들지 않을 때는 <strong>번호ㅉ</strong>로 초안을 취소하세요.</p>
      <p>라인형 파티와 구형 양식에는 기존 편집 제한이 적용됩니다. 취소는 상세 번호 삭제 이름을 사용해주세요.</p>
      <p>내전 이름·라인·시간·안내도 최신 양식에서 수정할 수 있어요. 같은 항목을 다른 사람이 먼저 바꿨다면 최신 양식을 다시 받아 작성해주세요.</p>
      <p>사이트 신청은 본인이 사이트에서, 운영진 확정 항목은 운영진이 수정해야 합니다.</p>
    </section>
    <section className={styles.section}>
      <h2>취소하거나 모집을 마칠 때</h2>
      <ul>
        <li>참가 취소: 파티는 <strong>상세 9 삭제 내이름</strong>, 내전은 <strong>내전상세 9 삭제 내이름</strong></li>
        <li>모집 마감: 파티는 <strong>9ㅉ</strong>, 내전은 <strong>내전 9ㅉ</strong></li>
        <li>편집 가능한 최신 N인파티·내전 양식에서 취소할 때는 번호 행을 남기고 이름만 비운 뒤 전체 전송해주세요. 다른 사람의 참가 내용은 확인 없이 변경하지 마세요.</li>
      </ul>
      <p>스크림은 카카오 모집 기능에서 제외되었습니다. 기존 저장 기록은 유지됩니다.</p>
    </section>
    <p className={styles.notice}>운영일은 한국 시간 오전 6시에 바뀝니다. 지난 양식 대신 봇이 출력한 최신 양식을 사용해 주세요.</p>
    <nav className={styles.links}>
      <Link href="/recruits">현재 모집 보기</Link>
      <Link href="/help/recruits">모집 이용 안내</Link>
    </nav>
  </div>;
}
