import Link from "next/link";
import { Database, UserRoundSearch } from "lucide-react";

import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";
import { parseCandidateQuery } from "@/modules/seasons/infrastructure/admin-kakao-pending-query";
import { loadRuntimeSeasonData } from "@/modules/seasons/infrastructure/runtime-season-data";

import { PendingApplicationActions } from "../pending-actions";
import styles from "../pending.module.css";

export const dynamic = "force-dynamic";

export default async function KakaoPendingApplicationDetailPage({ params, searchParams }: {
  params: Promise<{ pendingId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePageRole("ADMIN", "/admin/seasons/kakao-pending");
  const { pendingId } = await params;
  const raw = await searchParams;
  const url = new URL(`http://local.test/admin/seasons/kakao-pending/${pendingId}`);
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") url.searchParams.set(key, value);
    else if (Array.isArray(value)) for (const item of value) url.searchParams.append(key, item);
  }
  let queryError = false;
  let candidateQuery = "";
  try { candidateQuery = parseCandidateQuery(url.toString()); } catch { queryError = true; }
  const result = await loadRuntimeSeasonData((service) => service.getKakaoPendingApplication(pendingId, candidateQuery));
  return <main className={styles.page} data-admin-season-view="kakao-pending-detail">
    <header className={styles.header}><div><span>KAKAO REVIEW DETAIL</span><h1>보류 신청 상세</h1><p>제공된 정보와 활성 플레이어를 직접 대조한 뒤 연결합니다.</p></div><Link href="/admin/seasons/kakao-pending">목록으로 돌아가기</Link></header>
    {result.state !== "ready" ? <section className={styles.state} role={result.state === "error" ? "alert" : "status"}><Database aria-hidden="true" /><h2>보류 신청 상세를 불러오지 못했습니다.</h2></section> : <section className={styles.detailGrid}>
      <article className={styles.panel}><div className={styles.panelHeading}><div><span>SUPPLIED DATA</span><h2>{result.data.application.suppliedName}</h2></div><strong>{result.data.application.status}</strong></div>
        <dl className={styles.detailList}><div><dt>제공 Riot ID</dt><dd>{result.data.application.suppliedRiotId ?? "미제공"}</dd></div><div><dt>시즌</dt><dd>{result.data.application.seasonName}</dd></div><div><dt>신청 단위</dt><dd>{result.data.application.applyDate} · {result.data.application.recruitNo}회차 · 슬롯 {result.data.application.slotNo}</dd></div><div><dt>라인</dt><dd>{result.data.application.mainPosition} / {result.data.application.subPositions.join(" · ") || "부라인 없음"}</dd></div><div><dt>자동 판정</dt><dd>{result.data.application.matchState}{result.data.application.matchedPlayer ? ` · ${result.data.application.matchedPlayer.displayName}` : ""}</dd></div><div><dt>revision</dt><dd>{result.data.application.revision}</dd></div></dl>
      </article>
      <article className={styles.panel}><div className={styles.panelHeading}><div><span>PLAYER MATCH</span><h2>활성 플레이어 선택</h2></div><UserRoundSearch aria-hidden="true" /></div>
        <form className={styles.candidateSearch} method="get"><label>회원명·닉네임·Riot ID<input name="q" maxLength={80} defaultValue={candidateQuery} /></label><button type="submit">후보 검색</button></form>
        {queryError ? <p className={styles.notice} role="alert">허용되지 않은 검색 조건을 초기화했습니다.</p> : null}
        {result.data.candidates.length === 0 ? <p className={styles.notice}>일치 후보가 없습니다. 다른 이름이나 Riot ID로 검색해 주세요.</p> : null}
        <PendingApplicationActions application={result.data.application} candidates={result.data.candidates} canMutate={session.role === "SUPER_ADMIN"} />
      </article>
    </section>}
  </main>;
}
