export const dynamic = "force-dynamic";

import Link from "next/link";

async function getLogs() {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/api/admin/logs?limit=50`, {
      cache: "no-store",
    });

    if (!res.ok) return [];

    const data = await res.json();
    return Array.isArray(data.logs) ? data.logs : [];
  } catch {
    return [];
  }
}

export default async function AdminLogsPage() {
  const logs = await getLogs();

  return (
    <main className="admin-page">
      <div className="admin-page__header">
        <div>
          <h1 className="admin-page__title">관리자 감사 로그</h1>
          <p className="admin-page__description">
            관리자 로그인, 권한 변경, 삭제, 보안 설정 변경 이력을 확인합니다.
          </p>
        </div>

        <Link className="admin-button" href="/admin">
          관리자 홈
        </Link>
      </div>

      <section className="admin-card">
        <div className="admin-section-head">
          <div>
            <h2>최근 로그</h2>
            <p className="admin-muted">최근 50개 관리자 작업 기록입니다.</p>
          </div>
        </div>

        {logs.length === 0 ? (
          <div className="admin-empty">표시할 로그가 없습니다.</div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>시간</th>
                  <th>작업</th>
                  <th>관리자</th>
                  <th>대상</th>
                  <th>내용</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log: any) => (
                  <tr key={log.id}>
                    <td>{formatDate(log.createdAt)}</td>
                    <td>{log.action ?? "-"}</td>
                    <td>{log.actorUserId ?? log.actorId ?? "-"}</td>
                    <td>{log.targetType ? `${log.targetType} #${log.targetId ?? "-"}` : "-"}</td>
                    <td>{log.message ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function formatDate(value: string) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
