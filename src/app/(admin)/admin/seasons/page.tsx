import { prisma } from "@/lib/prisma/client";
import SeasonActivateButton from "./SeasonActivateButton";
import SeasonCreateForm from "./SeasonCreateForm";
import SeasonDeleteButton from "./SeasonDeleteButton";
import SeasonEditButton from "./SeasonEditButton";

export default async function AdminSeasonsPage() {
  const seasons = await prisma.season.findMany({
    orderBy: {
      id: "desc",
    },
  });

  return (
    <div className="page-container">
      <h1 className="page-title">시즌 관리</h1>

      {/* 시즌 생성 */}
      <SeasonCreateForm />

      <div className="card">
        <div className="admin-player-row-header">
          <div>시즌명</div>
          <div>상태</div>
          <div>생성일</div>
        </div>

        <div className="card-grid">
          {seasons.length === 0 ? (
            <div style={{ padding: "16px" }}>등록된 시즌이 없습니다.</div>
          ) : (
            seasons.map((season) => (
              <div key={season.id} className="admin-player-row-card">
                <div className="admin-player-row-grid">
                  {/* 시즌명 */}
                  <div className="player-col player-name">
                    {season.name}
                  </div>

                  {/* 상태 */}
                  <div className="player-col">
                    {season.isActive ? "활성" : "비활성"}
                  </div>

                  {/* 생성일 */}
                  <div className="player-col">
                    {new Date(season.createdAt).toLocaleDateString("ko-KR")}
                  </div>

                  {/* 버튼 */}
                  <div className="admin-player-actions">
                    <SeasonActivateButton
                      seasonId={season.id}
                      isActive={season.isActive}
                    />
                    <SeasonEditButton
                      seasonId={season.id}
                      currentName={season.name}
                    />
                    <SeasonDeleteButton seasonId={season.id} />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}