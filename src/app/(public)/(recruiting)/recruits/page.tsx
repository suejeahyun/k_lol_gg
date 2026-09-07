import type { Metadata } from "next";
import Link from "next/link";
import { Bot, CalendarClock, CircleAlert, Gamepad2, Sparkles, Swords, UsersRound } from "lucide-react";

import { loadRuntimeRecruiting } from "@/modules/recruiting/infrastructure/runtime-recruiting";

import styles from "./recruits.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "파티·스크림 모집",
  description: "현재 진행 중인 K-LOL.GG 파티와 스크림 모집을 확인합니다.",
  alternates: { canonical: "/recruits" },
};

const partyTypeLabel = {
  FLEX_RANK: "자유 랭크", NORMAL_GAME: "일반 게임", SOLO_RANK: "솔로 랭크", ARAM: "칼바람",
  TFT_NORMAL: "전략적 팀 전투", TFT_RANK: "전략적 팀 전투 랭크", DOUBLE_UP: "더블 업",
  PARTY_NUMBER: "파티 번호", PARTY_RIFT: "파티 협곡", OTHER_GAME: "기타 게임",
} as const;

function timeLabel(value: string | null) {
  if (!value) return "시간 협의";
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" }).format(new Date(value));
}

export default async function RecruitsPage() {
  const result = await loadRuntimeRecruiting((service) => service.listPublicFeed());
  const empty = result.state === "ready" && result.data.parties.length === 0 && result.data.scrims.length === 0;
  return (
    <div className={`page-wrap ${styles.page}`}>
      <section className={styles.hero} aria-labelledby="recruit-title">
        <div><p>PLAY TOGETHER</p><h1 id="recruit-title">오늘 같이 플레이해요</h1><span>카카오톡 봇과 사이트에서 등록된 진행 중 모집만 보여드려요.</span></div>
        <UsersRound aria-hidden="true" />
      </section>

      <nav className={styles.guides} aria-label="모집 도움말">
        <Link href="/help/recruits"><Gamepad2 aria-hidden="true" /> 모집 이용 방법</Link>
        <Link href="/help/kakao"><Bot aria-hidden="true" /> 카카오 봇 명령 안내</Link>
      </nav>

      {result.state === "ready" && !empty ? (
        <>
          <section aria-labelledby="party-recruits-title">
            <header className={styles.heading}><div><span>PARTY</span><h2 id="party-recruits-title">파티 모집</h2></div><p>{result.data.parties.length}개 진행 중</p></header>
            {result.data.parties.length === 0 ? <div className={styles.inlineEmpty}>진행 중인 파티 모집이 없어요.</div> : (
              <div className={styles.cards}>
                {result.data.parties.map((party) => <article className={styles.card} key={party.id}>
                  <div className={styles.cardTop}><span>{partyTypeLabel[party.type]}</span><b>#{party.recruitNumber}</b></div>
                  <h3>{party.title}</h3>
                  <dl><div><dt>참여</dt><dd>{party.memberCount} / {party.maximumMembers}명</dd></div><div><dt>예정</dt><dd>{timeLabel(party.scheduledStartAt)}</dd></div></dl>
                  <div className={styles.capacity} aria-label={`정원 ${party.maximumMembers}명 중 ${party.memberCount}명 참여`}><i style={{ width: `${Math.min(100, party.memberCount / party.maximumMembers * 100)}%` }} /></div>
                </article>)}
              </div>
            )}
          </section>
          <section aria-labelledby="scrim-recruits-title">
            <header className={styles.heading}><div><span>SCRIM</span><h2 id="scrim-recruits-title">스크림 모집</h2></div><p>{result.data.scrims.length}개 진행 중</p></header>
            {result.data.scrims.length === 0 ? <div className={styles.inlineEmpty}>진행 중인 스크림 모집이 없어요.</div> : (
              <div className={styles.cards}>
                {result.data.scrims.map((scrim) => <article className={styles.card} key={scrim.id}>
                  <div className={styles.cardTop}><span>{scrim.status === "RECRUITING" ? "상대 모집 중" : scrim.status === "MATCHED" ? "매칭됨" : "확정"}</span><b>#{scrim.scrimNumber}</b></div>
                  <h3>BO{scrim.bestOf} 스크림</h3>
                  <dl><div><dt>요청 팀</dt><dd>{scrim.requesterTeamId.slice(0, 8)}</dd></div><div><dt>예정</dt><dd>{timeLabel(scrim.scheduledAt)}</dd></div></dl>
                  <p className={styles.scrimLine}><Swords aria-hidden="true" /> {scrim.opponentTeamId ? `상대 팀 ${scrim.opponentTeamId.slice(0, 8)}` : "상대 팀을 기다리고 있어요"}</p>
                </article>)}
              </div>
            )}
          </section>
        </>
      ) : result.state === "ready" ? (
        <section className={styles.state}><Sparkles aria-hidden="true" /><h2>지금은 열린 모집이 없어요.</h2><p>새 모집이 등록되면 이 화면에 바로 나타납니다.</p><Link href="/help/recruits">모집 방법 알아보기</Link></section>
      ) : result.state === "unavailable" ? (
        <section className={styles.state} role="status"><CalendarClock aria-hidden="true" /><h2>모집을 확인할 수 없어요.</h2><p>잠시 후 다시 확인해 주세요.</p></section>
      ) : (
        <section className={styles.state} role="alert"><CircleAlert aria-hidden="true" /><h2>모집을 불러오지 못했어요.</h2><p>잠시 후 다시 시도해 주세요.</p></section>
      )}
    </div>
  );
}
