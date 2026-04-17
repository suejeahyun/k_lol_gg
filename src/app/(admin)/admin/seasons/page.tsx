import SeasonActivateButton from "./SeasonActivateButton";
import SeasonCreateForm from "./SeasonCreateForm";
import SeasonDeleteButton from "./SeasonDeleteButton";
import SeasonEditButton from "./SeasonEditButton";

type SeasonItem = {
  id: number;
  name: string;
  isActive: boolean;
  createdAt?: string;
};

async function getSeasons(): Promise<SeasonItem[]> {
  const res = await fetch("http://localhost:3000/api/seasons", {
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error("시즌 목록을 불러오지 못했습니다.");
  }

  return res.json();
}

export default async function AdminSeasonsPage() {
  const seasons = await getSeasons();

  return (
    <div className="page-container">
      <h1 className="page-title">시즌 관리</h1>

      <SeasonCreateForm />

      <div className="card">
        <div className="player-row-header admin-player-row-header">
          <div>시즌명</div>
          <div>상태</div>
          <div>생성일</div>
          <div style={{ textAlign: "right" }}>관리</div>
        </div>

        <div className="card-grid">
          {seasons.map((season) => (
            <div key={season.id} className="admin-player-row-card">
              <div className="admin-player-row-grid">
                <div className="player-col player-name">{season.name}</div>

                <div className="player-col">
                  {season.isActive ? "활성" : "비활성"}
                </div>

                <div className="player-col">
                  {season.createdAt
                    ? new Date(season.createdAt).toLocaleDateString("ko-KR")
                    : "-"}
                </div>

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
          ))}
        </div>
      </div>
    </div>
  );
}