import Pagination from "@/components/Pagination";

type AdminLog = {
  id: number;
  action: string;
  message: string;
  createdAt: string;
};

type LogsResponse = {
  logs: AdminLog[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
};

async function getLogs(searchParams: {
  page?: string;
  q?: string;
}): Promise<LogsResponse> {
  const params = new URLSearchParams();
  params.set("page", searchParams.page ?? "1");
  params.set("pageSize", "50");

  if (searchParams.q?.trim()) {
    params.set("q", searchParams.q.trim());
  }

  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

  const res = await fetch(`${baseUrl}/api/logs?${params.toString()}`, {
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error("로그 목록 조회 실패");
  }

  return res.json();
}

type PageProps = {
  searchParams: Promise<{
    page?: string;
    q?: string;
  }>;
};

export default async function AdminLogsPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const data = await getLogs(resolvedSearchParams);
  const q = resolvedSearchParams.q ?? "";

  return (
    <main className="admin-page">
      <div className="admin-page__header">
        <div>
          <p className="admin-page__kicker">OPERATION LOG</p>
          <h1>관리자 로그</h1>
          <p className="admin-page__description">
            생성, 수정, 삭제, 승인, 활성화, 참가 신청 등 주요 변경 이력을
            확인합니다.
          </p>
        </div>
      </div>

      <form className="admin-filter-bar" action="/admin/logs">
        <input
          name="q"
          defaultValue={q}
          placeholder="액션 또는 메시지 검색"
          className="admin-input"
        />
        <button className="admin-button" type="submit">
          검색
        </button>
      </form>

      <section className="admin-card">
        <div className="admin-section-head">
          <div>
            <h2>로그 목록</h2>
            <p className="admin-muted">
              총 {data.pagination.totalCount.toLocaleString("ko-KR")}개 · 현재{" "}
              {data.pagination.page} / {data.pagination.totalPages}페이지
            </p>
          </div>
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>액션</th>
                <th>내용</th>
                <th>시간</th>
              </tr>
            </thead>
            <tbody>
              {data.logs.length === 0 ? (
                <tr>
                  <td colSpan={4}>저장된 로그가 없습니다.</td>
                </tr>
              ) : (
                data.logs.map((log) => (
                  <tr key={log.id}>
                    <td>{log.id}</td>
                    <td>{log.action}</td>
                    <td>{log.message}</td>
                    <td>
                      {new Intl.DateTimeFormat("ko-KR", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(new Date(log.createdAt))}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          currentPage={data.pagination.page}
          totalPages={data.pagination.totalPages}
          basePath="/admin/logs"
          query={q ? { q } : undefined}
        />
      </section>
    </main>
  );
}
