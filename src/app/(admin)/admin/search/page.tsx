import Link from "next/link";
import { Search } from "lucide-react";
import { ADMIN_WORKSPACES } from "@/modules/admin/domain/admin-workspaces";
import styles from "./search.module.css";

type AdminSearchPageProps = {
  searchParams: Promise<{ q?: string | string[] }>;
};

function normalizeQuery(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value ?? "").trim().slice(0, 80);
}

export default async function AdminSearchPage({ searchParams }: AdminSearchPageProps) {
  const query = normalizeQuery((await searchParams).q);
  const normalized = query.toLocaleLowerCase("ko-KR");
  const results = query
    ? ADMIN_WORKSPACES.filter((workspace) =>
      [workspace.label, workspace.description, workspace.scope]
        .join(" ")
        .toLocaleLowerCase("ko-KR")
        .includes(normalized))
    : ADMIN_WORKSPACES;

  return (
    <main className={styles.page}>
      <header><span>권한 범위 내 검색</span><h1>관리자 작업 공간 찾기</h1><p>현재 A0 단계에서는 작업 공간만 검색합니다. 플레이어·계정·경기 데이터 검색은 DB 권한 필터와 함께 연결합니다.</p></header>
      <form className={styles.search} role="search">
        <label htmlFor="admin-search">검색어</label>
        <div><Search aria-hidden="true" /><input id="admin-search" name="q" defaultValue={query} maxLength={80} placeholder="예: 경기, Riot, 징계" /><button type="submit">찾기</button></div>
      </form>
      <section aria-live="polite" aria-labelledby="admin-search-results">
        <h2 id="admin-search-results">{query ? `“${query}” 검색 결과 ${results.length}개` : "전체 작업 공간"}</h2>
        {results.length ? <ul>{results.map((workspace) => <li key={workspace.id}><Link href={workspace.href}><strong>{workspace.label}</strong><span>{workspace.description}</span></Link></li>)}</ul> : <p className={styles.empty}>일치하는 작업 공간이 없습니다. 다른 단어로 다시 찾아보세요.</p>}
      </section>
    </main>
  );
}
