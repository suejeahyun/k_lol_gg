import { Bot, CircleAlert, Clock3, DatabaseZap, MessagesSquare } from "lucide-react";
import { loadRuntimeRecruiting } from "@/modules/recruiting/infrastructure/runtime-recruiting";
import styles from "./kakao.module.css";

export const dynamic = "force-dynamic";

export default async function AdminKakaoPage() {
  const result = await loadRuntimeRecruiting((service) => service.getAdminStatus());
  return <main className={styles.page}>
    <header className={styles.header}><div><span><Bot aria-hidden="true" /> KAKAO · S09</span><h1>모집 연동 상태</h1><p>실제 저장된 파티·스크림과 미처리 outbox 상태를 확인합니다.</p></div></header>
    {result.state === "ready" ? <>
      <section className={styles.summary} aria-label="모집 운영 요약"><article><MessagesSquare/><span>열린 파티</span><strong>{result.data.openPartyCount}</strong></article><article><Clock3/><span>진행 스크림</span><strong>{result.data.openScrimCount}</strong></article><article><DatabaseZap/><span>대기 outbox</span><strong>{result.data.pendingOutboxCount}</strong></article></section>
      <section className={styles.panel}><div className={styles.panelHead}><h2>최근 파티</h2><span>{result.data.recentParties.length}건</span></div>{result.data.recentParties.length===0?<p className={styles.empty}>저장된 파티가 없습니다.</p>:<div className={styles.tableWrap}><table><thead><tr><th>번호</th><th>제목</th><th>상태</th><th>인원</th><th>revision</th><th>갱신</th></tr></thead><tbody>{result.data.recentParties.map((party)=><tr key={party.id}><td>#{party.recruitNumber}</td><td>{party.title}</td><td>{party.status}</td><td>{party.memberCount}/{party.maximumMembers}</td><td>{party.revision}</td><td><time dateTime={party.updatedAt}>{new Date(party.updatedAt).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"})}</time></td></tr>)}</tbody></table></div>}</section>
      <section className={styles.panel}><div className={styles.panelHead}><h2>최근 스크림</h2><span>{result.data.recentScrims.length}건</span></div>{result.data.recentScrims.length===0?<p className={styles.empty}>저장된 스크림이 없습니다.</p>:<div className={styles.tableWrap}><table><thead><tr><th>번호</th><th>요청 팀</th><th>상대 팀</th><th>상태</th><th>revision</th><th>갱신</th></tr></thead><tbody>{result.data.recentScrims.map((scrim)=><tr key={scrim.id}><td>#{scrim.scrimNumber}</td><td><code>{scrim.requesterTeamId.slice(0,8)}</code></td><td>{scrim.opponentTeamId?<code>{scrim.opponentTeamId.slice(0,8)}</code>:"—"}</td><td>{scrim.status}</td><td>{scrim.revision}</td><td><time dateTime={scrim.updatedAt}>{new Date(scrim.updatedAt).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"})}</time></td></tr>)}</tbody></table></div>}</section>
    </>:result.state==="unavailable"?<section className={styles.state} role="status"><DatabaseZap/><h2>모집 저장소를 사용할 수 없습니다.</h2><p>데이터베이스 연결과 0009 migration 상태를 확인해 주세요.</p></section>:<section className={styles.state} role="alert"><CircleAlert/><h2>모집 상태를 불러오지 못했습니다.</h2><p>서버 로그의 trace와 데이터베이스 상태를 확인해 주세요.</p></section>}
  </main>;
}
