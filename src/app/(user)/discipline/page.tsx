import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma/client";
import { buildDisciplineStatistics } from "@/lib/discipline/statistics";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "운영 징계 통계",
  description: "K-LOL.GG 활성 주의·경고·밴 현황과 주의 3회 환산 통계",
  alternates: { canonical: "/discipline" },
  robots: { index: false, follow: false },
};

export default async function PublicDisciplinePage() {
  const records = await prisma.userDisciplineRecord.findMany({
    where: { isActive: true, type: { in: ["CAUTION", "WARNING", "BAN"] } },
    select: {
      userAccountId: true,
      playerId: true,
      targetName: true,
      targetNickname: true,
      targetTag: true,
      type: true,
      player: { select: { name: true, nickname: true, tag: true } },
    },
  });
  const statistics = buildDisciplineStatistics(records);
  const summary = statistics.reduce(
    (acc, person) => {
      acc.cautions += person.cautionCount;
      acc.warnings += person.warningCount;
      if (person.isBanned) acc.banned += 1;
      return acc;
    },
    { cautions: 0, warnings: 0, banned: 0 },
  );

  return (
    <main className="public-discipline">
      <style>{styles}</style>
      <p className="page-eyebrow">COMMUNITY POLICY</p>
      <h1>운영 징계 통계</h1>
      <p className="intro">
        현재 활성 상태인 주의·경고·밴 기록을 대상별로 집계합니다. 주의 3회는 경고 1회로
        환산하며, 환산 후 남은 주의만 주의 횟수에 표시합니다.
      </p>
      <Link className="app-button" href="/discipline/evidence">내 경고 차감 사진 제출</Link>

      <section className="stats" aria-label="활성 징계 요약">
        <article className="stat"><span>징계 대상</span><strong>{statistics.length}명</strong><small>활성 기록 기준</small></article>
        <article className="stat caution"><span>남은 주의</span><strong>{summary.cautions}회</strong><small>3회 미만 잔여 합계</small></article>
        <article className="stat warning"><span>환산 경고</span><strong>{summary.warnings}회</strong><small>직접 경고 + 주의 환산</small></article>
        <article className="stat ban"><span>밴 상태</span><strong>{summary.banned}명</strong><small>활성 밴 기록 보유</small></article>
      </section>

      <section className="card table-card">
        <div className="section-head">
          <div><h2>대상별 징계 현황</h2><p>밴, 경고, 주의 순으로 표시됩니다.</p></div>
          <span className="discipline-conversion-rule">주의 3회 = 경고 1회</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>이름</th><th>닉네임</th><th>주의</th><th>경고</th><th>밴 상태</th></tr></thead>
            <tbody>
              {statistics.length === 0 ? (
                <tr><td className="empty" colSpan={5}>현재 활성 징계 기록이 없습니다.</td></tr>
              ) : statistics.map((person) => (
                <tr key={person.key}>
                  <td data-label="이름"><strong>{person.name}</strong></td>
                  <td data-label="닉네임">{person.nickname}</td>
                  <td data-label="주의"><span className={`count-pill ${person.cautionCount > 0 ? "has-caution" : ""}`}>{person.cautionCount}회</span></td>
                  <td data-label="경고">
                    <span className={`count-pill ${person.warningCount > 0 ? "has-warning" : ""}`}>{person.warningCount}회</span>
                    {person.convertedWarnings > 0 ? <small className="converted">주의 환산 +{person.convertedWarnings}</small> : null}
                  </td>
                  <td data-label="밴 상태"><span className={`ban-pill ${person.isBanned ? "is-banned" : "is-clear"}`}>{person.isBanned ? "밴" : "해당 없음"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

const styles = `
  .public-discipline{width:min(1180px,calc(100vw - 40px));margin:0 auto;padding:36px 0 64px}
  .public-discipline h1{margin:5px 0 10px}.intro{max-width:820px;color:rgba(210,230,255,.78);line-height:1.65;margin:0 0 24px}
  .stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin:22px 0}
  .stat,.card{border:1px solid rgba(82,164,255,.24);border-radius:18px;background:linear-gradient(180deg,rgba(10,28,55,.86),rgba(5,15,34,.76));box-shadow:0 16px 40px rgba(0,0,0,.2)}
  .stat{padding:20px;display:grid;gap:8px}.stat span,.stat small{color:rgba(210,230,255,.72)}.stat strong{font-size:30px}.stat.caution{border-color:rgba(255,214,102,.34)}.stat.warning{border-color:rgba(255,120,120,.4)}.stat.ban{border-color:rgba(248,113,113,.5);background:linear-gradient(180deg,rgba(66,14,28,.76),rgba(5,15,34,.76))}
  .card{padding:22px}.section-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:16px}.section-head h2{margin:0 0 5px}.section-head p{margin:0;color:rgba(210,230,255,.68);font-size:14px}.discipline-conversion-rule{display:inline-flex;padding:7px 11px;border:1px solid rgba(255,214,102,.35);border-radius:999px;background:rgba(255,185,60,.12);color:#ffe58f;font-weight:800;font-size:13px;white-space:nowrap}
  .table-wrap{overflow-x:auto;border:1px solid rgba(96,166,255,.16);border-radius:14px}table{width:100%;min-width:720px;border-collapse:collapse}th,td{padding:15px 16px;text-align:left;border-bottom:1px solid rgba(96,166,255,.13)}th{color:#bfe7ff;background:rgba(7,22,48,.92);font-size:13px}tbody tr:last-child td{border-bottom:0}tbody tr:hover{background:rgba(73,145,255,.06)}td:nth-child(3),td:nth-child(4),td:nth-child(5){width:150px}.count-pill,.ban-pill{display:inline-flex;align-items:center;justify-content:center;min-width:56px;padding:6px 10px;border-radius:999px;border:1px solid rgba(150,170,200,.2);background:rgba(120,140,170,.1);font-weight:850;font-size:13px}.has-caution{color:#ffe58f;border-color:rgba(255,214,102,.35);background:rgba(255,185,60,.13)}.has-warning{color:#ffb3b3;border-color:rgba(255,120,120,.4);background:rgba(255,76,76,.13)}.ban-pill.is-banned{color:#fecaca;border-color:rgba(248,113,113,.48);background:rgba(185,28,28,.24)}.ban-pill.is-clear{color:#9fffc7;border-color:rgba(82,255,160,.3);background:rgba(24,180,95,.11)}.converted{display:block;margin-top:5px;color:rgba(210,230,255,.62);font-size:11px}.empty{text-align:center;padding:34px;color:rgba(210,230,255,.7)}
  @media(max-width:900px){.stats{grid-template-columns:repeat(2,minmax(0,1fr))}}
  @media(max-width:640px){.public-discipline{width:min(100% - 20px,1180px);padding-top:22px}.stats{grid-template-columns:1fr 1fr}.stat{padding:16px}.stat strong{font-size:26px}.card{padding:14px}.section-head{align-items:flex-start;flex-direction:column}.table-wrap{margin:0 -2px}.public-discipline tbody td{display:grid!important;grid-template-columns:76px minmax(0,1fr);align-items:center;gap:10px;width:100%;text-align:left}.public-discipline tbody td::before{content:attr(data-label);color:#8fb7df;font-size:12px;font-weight:800}.public-discipline tbody td.empty{display:block!important}.public-discipline tbody td.empty::before{content:none}.converted{grid-column:2}}
`;
