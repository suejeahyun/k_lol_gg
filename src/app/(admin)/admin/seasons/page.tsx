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

      <SeasonCreateForm />

      <div className="card">
        {seasons.length === 0 ? (
          <p>등록된 시즌이 없습니다.</p>
        ) : (
          <div className="card-grid">
            {seasons.map((season) => (
              <div key={season.id} className="admin-player-row-card">
                <div className="admin-player-row-grid">
                  <div className="player-col player-name">{season.name}</div>

                  <div className="player-col">
                    {season.isActive ? "활성" : "비활성"}
                  </div>

                  <div className="player-col">
                    {new Date(season.createdAt).toLocaleDateString("ko-KR")}
                  </div>

                  <div className="admin-player-actions">
                    <SeasonEditButton season={season} />
                    <SeasonActivateButton
                      seasonId={season.id}
                      isActive={season.isActive}
                    />
                    <SeasonDeleteButton seasonId={season.id} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}