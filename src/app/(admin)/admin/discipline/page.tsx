import Link from "next/link";

import styles from "@/components/admin/admin-operations.module.css";
import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";
import { loadRuntimeDiscipline } from "@/modules/discipline/infrastructure/runtime-discipline";

export const dynamic = "force-dynamic";

const typeLabel = { CAUTION: "주의", WARNING: "경고", BAN: "이용 제한" } as const;
const taskStatusLabel = {
  REQUIRED: "업로드 필요",
  AWAITING_UPLOAD: "추가 업로드 필요",
  PENDING_REVIEW: "검토 대기",
  REJECTED: "보완 필요",
  APPROVED: "승인 완료",
  CANCELLED: "취소됨",
} as const;

const PAGE_SIZE = 50;
const MAX_PAGE = 10_000;

function pageHref(tab: "records" | "tasks" | "reviews", page: number) {
  const params = new URLSearchParams({ tab });
  if (page > 1) params.set("page", String(page));
  return `/admin/discipline?${params}`;
}

export default async function AdminDisciplinePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePageRole("ADMIN", "/admin/discipline");
  const raw = await searchParams;
  const selected = typeof raw.tab === "string" ? raw.tab : "records";
  const pageRaw = typeof raw.page === "string" ? raw.page : "1";
  const page = Number(pageRaw);
  if (Object.entries(raw).some(([key, value]) => !["tab", "page"].includes(key) || Array.isArray(value)) ||
    !["records", "tasks", "reviews"].includes(selected) || !/^[1-9][0-9]{0,4}$/u.test(pageRaw) || page > MAX_PAGE) {
    return <main className={styles.page}><h1>징계 관리</h1><section className={styles.state} role="alert"><h2>조회 조건을 확인해 주세요.</h2><Link className={styles.link} href="/admin/discipline">조건 초기화</Link></section></main>;
  }
  const tab = selected as "records" | "tasks" | "reviews";
  const result = await loadRuntimeDiscipline((service) => service.adapter.listAdmin({ tab, page, pageSize: PAGE_SIZE }));
  const total = result.state === "ready" ? result.data.totalCount : 0;
  const pageCount = Math.max(1, Math.min(MAX_PAGE, Math.ceil(total / PAGE_SIZE)));
  return <main className={styles.page}><header className={styles.header}><div><h1>징계 관리</h1></div><Link className={styles.button} href="/admin/discipline/new">새 기록</Link></header><nav className={styles.tabs} aria-label="징계 관리 분류"><Link href="/admin/discipline" aria-current={tab === "records" ? "page" : undefined}>전체 기록</Link><Link href="/admin/discipline?tab=tasks" aria-current={tab === "tasks" ? "page" : undefined}>과제</Link><Link href="/admin/discipline?tab=reviews" aria-current={tab === "reviews" ? "page" : undefined}>검토 대기</Link></nav>
    {result.state === "ready" ? <>
      <p className={styles.summary} aria-label="징계 조회 범위">전체 {total.toLocaleString("ko-KR")}건 · {result.data.items.length ? `${((page - 1) * PAGE_SIZE + 1).toLocaleString("ko-KR")}–${((page - 1) * PAGE_SIZE + result.data.items.length).toLocaleString("ko-KR")}건 표시` : "현재 페이지 0건"}</p>
      {total > MAX_PAGE * PAGE_SIZE ? <p className={styles.summary}>페이지 조회는 처음 500,000건까지 가능합니다. 분류를 바꿔 범위를 좁혀 주세요.</p> : null}
      {result.data.items.length ? <div className={styles.tableWrap} role="region" aria-label="징계 기록 목록" tabIndex={0}><table className={styles.table}><thead><tr><th scope="col">대상</th><th scope="col">유형</th><th scope="col">상태</th><th scope="col">과제</th><th scope="col">등록일</th><th scope="col">보기</th></tr></thead><tbody>{result.data.items.map((record) => <tr key={record.id}><td>{record.targetName}</td><td>{typeLabel[record.type]}</td><td><span className={styles.badge} data-status={record.active ? "ACTIVE" : "INACTIVE"}>{record.active ? "활성" : "종료"}</span></td><td>{record.task ? taskStatusLabel[record.task.status] : "없음"}</td><td>{new Intl.DateTimeFormat("ko-KR", { dateStyle: "short" }).format(new Date(record.createdAt))}</td><td><Link href={`/admin/discipline/${record.id}`}>상세</Link></td></tr>)}</tbody></table></div> : <section className={styles.state} role="status"><h2>{page > 1 ? "현재 페이지에 기록이 없습니다." : "이 분류의 기록이 없습니다."}</h2>{page > 1 ? <Link className={styles.link} href={pageHref(tab, 1)}>첫 페이지로</Link> : <p>분류를 바꾸거나 새 기록을 등록해 주세요.</p>}</section>}
      {result.data.items.length > 0 && pageCount > 1 ? <nav className={styles.tabs} aria-label="징계 목록 페이지">
        {page > 1 ? <Link href={pageHref(tab, page - 1)}>이전</Link> : <span aria-disabled="true">이전</span>}
        <span aria-current="page">{page} / {pageCount} 페이지</span>
        {page < pageCount ? <Link href={pageHref(tab, page + 1)}>다음</Link> : <span aria-disabled="true">다음</span>}
      </nav> : null}
    </> : <section className={styles.state} role={result.state === "unavailable" ? "status" : "alert"}><p>{result.state === "unavailable" ? "징계 기록을 확인할 수 없습니다." : "징계 기록을 불러오지 못했습니다."}</p><a className={styles.link} href={pageHref(tab, page)}>다시 불러오기</a></section>}
  </main>;
}
