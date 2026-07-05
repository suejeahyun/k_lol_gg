import { DestructionScrimRecruitStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { formatScrimTime, getScrimStatusLabel } from "@/lib/kakao/destruction-scrim-recruit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageSearchParams = Promise<{
  q?: string;
  status?: string;
}>;

const STATUS_OPTIONS = [
  { value: "ALL", label: "전체" },
  { value: "RECRUITING", label: "모집중" },
  { value: "MATCHED", label: "상대 신청" },
  { value: "CONFIRMED", label: "확정" },
  { value: "COMPLETED", label: "완료" },
  { value: "CANCELED", label: "취소" },
];

export default async function AdminKakaoScrimsPage({ searchParams }: { searchParams: PageSearchParams }) {
  const params = await searchParams;
  const q = String(params.q || "").trim();
  const status = String(params.status || "ALL");

  const scrims = await prisma.destructionScrimRecruit.findMany({
    where: {
      ...(status !== "ALL" ? { status: status as DestructionScrimRecruitStatus } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { requesterTeamName: { contains: q, mode: "insensitive" } },
              { opponentTeamName: { contains: q, mode: "insensitive" } },
              { memo: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: {
      tournament: { select: { id: true, title: true } },
    },
    orderBy: [{ status: "asc" }, { scheduledAt: "asc" }, { updatedAt: "desc" }],
    take: 100,
  });

  return (
    <main className="admin-page">
      <section className="admin-page__header">
        <div>
          <p className="admin-page__eyebrow">Kakao Recruit Split</p>
          <h1>스크림구인 관리</h1>
          <p className="admin-page__description">내전구인/파티구인과 분리된 멸망전 스크림 전용 모집 현황입니다.</p>
        </div>
      </section>

      <form className="admin-filter" action="/admin/kakao/scrims">
        <label>
          상태
          <select name="status" defaultValue={status}>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label>
          검색
          <input name="q" defaultValue={q} placeholder="팀명, 메모 검색" />
        </label>
        <button type="submit">조회</button>
        <a href="/admin/kakao/scrims">초기화</a>
      </form>

      <section className="admin-card">
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>번호</th>
                <th>대회</th>
                <th>일시</th>
                <th>요청팀</th>
                <th>상대팀</th>
                <th>판수</th>
                <th>상태</th>
                <th>등록자</th>
                <th>수정일</th>
              </tr>
            </thead>
            <tbody>
              {scrims.map((scrim) => (
                <tr key={scrim.id}>
                  <td>#{scrim.scrimNo}</td>
                  <td>{scrim.tournament.title}</td>
                  <td>{formatScrimTime(scrim.scheduledAt, scrim.startTimeText)}</td>
                  <td>{scrim.requesterTeamName || "-"}</td>
                  <td>{scrim.opponentTeamName || "상대구함"}</td>
                  <td>{scrim.gameCount ? `${scrim.gameCount}판` : "-"}</td>
                  <td>{getScrimStatusLabel(scrim.status)}</td>
                  <td>{scrim.sender || "-"}</td>
                  <td>{scrim.updatedAt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</td>
                </tr>
              ))}
              {scrims.length === 0 ? (
                <tr>
                  <td colSpan={9}>등록된 스크림구인이 없습니다.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
