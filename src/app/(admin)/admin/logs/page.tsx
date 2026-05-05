import { prisma } from "@/lib/prisma/client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

export default async function AdminLogsPage() {
  const logs = await prisma.adminLog.findMany({
    orderBy: {
      createdAt: "desc",
    },
    take: 100,
    select: {
      id: true,
      type: true,
      message: true,
      createdAt: true,
    },
  });

  return (
    <main className="admin-page">
      <section className="admin-page-header">
        <div>
          <p className="admin-page-kicker">ADMIN LOGS</p>
          <h1>관리자 로그</h1>
          <p className="admin-page-description">
            관리자 작업 이력을 최근순으로 확인합니다.
          </p>
        </div>
      </section>

      <section className="admin-card">
        <div className="admin-card-header">
          <div>
            <h2>로그 목록</h2>
            <p>최근 100개의 관리자 작업 로그입니다.</p>
          </div>
        </div>

        {logs.length === 0 ? (
          <div className="admin-empty">
            <strong>등록된 로그가 없습니다.</strong>
            <p>
              플레이어, 내전, 시즌 등 관리자 작업이 발생하면 이곳에
              표시됩니다.
            </p>
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>번호</th>
                  <th>유형</th>
                  <th>내용</th>
                  <th>일시</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td>{log.id}</td>
                    <td>
                      <span className="admin-log-type">{log.type}</span>
                    </td>
                    <td>{log.message}</td>
                    <td>{formatDate(log.createdAt)}</td>
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