import { ArrowRight } from "@/components/theme/theme-icons";
import Link from "next/link";

import { loadRuntimeEvent } from "@/modules/competitions/events/infrastructure/runtime-event";
import { loadRuntimeDestruction } from "@/modules/competitions/destruction/runtime-destruction";

export async function RecruitingCompetitions({ type }: { type: "event" | "destruction" }) {
  const query = { query: "", status: "RECRUITING" as const, format: null, page: 1, pageSize: 12 as const };
  const result = type === "event"
    ? await loadRuntimeEvent(({ repository }) => repository.listPublic(query, new Date()))
    : await loadRuntimeDestruction(({ repository }) => repository.listPublic(query));
  const label = type === "event" ? "이벤트전" : "멸망전";
  const base = type === "event" ? "/competitions/events" : "/competitions/destruction";
  return <section className="task-section" aria-labelledby="recruiting-competitions-title">
    <h2 id="recruiting-competitions-title">신청 가능한 {label}</h2>
    <p>참가 신청: 승인 계정 필요</p>
    {result.state === "ready" ? result.data.items.length ? <div className="task-links">{result.data.items.map((item) =>
      <Link className="task-link" key={item.id} href={`${base}/${item.id}?action=apply`}><strong>{item.title}</strong><span>{item.participantCount}명 참가 · 모집 중</span><b>참가 신청하기 <ArrowRight className="theme-inline-icon" aria-hidden="true" /></b></Link>
    )}</div> : <p role="status">현재 신청 가능한 {label}이 없습니다.</p> : <p role="alert">모집 중인 대회를 불러오지 못했어요.</p>}
    <nav className="recovery-links" aria-label={`${label} 탐색`}><Link href={base}>전체 {label} 보기</Link><Link href="/applications">오늘 내전 신청</Link><Link href="/recruits">파티 모집 보기</Link></nav>
  </section>;
}
