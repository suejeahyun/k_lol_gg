export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma/client";

export default async function AdminDiscordMonitorPage() {
  const parties = await prisma.recruitParty.findMany({
    where: { status: "IN_PROGRESS" },
    include: {
      members: { orderBy: [{ slotNo: "asc" }, { createdAt: "asc" }] },
      discordMonitor: true,
    },
    orderBy: [{ updatedAt: "desc" }],
    take: 50,
  });

  return (
    <main className="admin-page">
      <div className="admin-page__header">
        <div>
          <h1 className="admin-page__title">디스코드 구인 모니터</h1>
          <p className="admin-page__description">
            디스코드 음성 활동 기반 자동 ㅉ 후보와 자동 마감 기록을 운영진만 확인합니다.
          </p>
        </div>
      </div>

      <section className="admin-card">
        <div className="admin-section-head">
          <div>
            <h2>진행중 구인</h2>
            <p className="admin-muted">유저에게는 세부 입퇴장 로그가 공개되지 않습니다.</p>
          </div>
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>번호</th>
                <th>제목</th>
                <th>참가</th>
                <th>디코 상태</th>
                <th>참가자 잔류</th>
                <th>비참가자</th>
                <th>후보 시작</th>
                <th>마지막 확인</th>
              </tr>
            </thead>
            <tbody>
              {parties.length === 0 ? (
                <tr>
                  <td colSpan={8}>진행중 구인이 없습니다.</td>
                </tr>
              ) : (
                parties.map((party) => {
                  const monitor = party.discordMonitor;
                  const memberCount = party.members.filter((member) => member.name.trim() !== "" && !member.isSubstitute).length;
                  return (
                    <tr key={party.id}>
                      <td>#{party.recruitNo}</td>
                      <td>{party.title}</td>
                      <td>{memberCount}/{party.maxMembers}</td>
                      <td>{monitor?.status ?? "미확인"}</td>
                      <td>{monitor ? `${monitor.lastPresentExpectedCount}/${monitor.lastExpectedCount}` : "-"}</td>
                      <td>{monitor?.lastNonParticipantCount ?? "-"}</td>
                      <td>{monitor?.finishCandidateStartedAt ? new Date(monitor.finishCandidateStartedAt).toLocaleString("ko-KR") : "-"}</td>
                      <td>{monitor?.lastScannedAt ? new Date(monitor.lastScannedAt).toLocaleString("ko-KR") : "-"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
