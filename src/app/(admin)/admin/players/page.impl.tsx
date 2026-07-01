"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import Pagination from "@/components/Pagination";

type Player = {
  id: number;
  name: string;
  nickname: string;
  tag: string;
  peakTier: string | null;
  currentTier: string | null;
  createdAt: string;
  userAccount: {
    id: number;
    userId: string;
    role: string;
    status: string;
  } | null;
};

type PlayersListResponse = {
  items: Player[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
  pageSize: number;
};

async function parseResponse<T>(res: Response): Promise<T | null> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export default function AdminPlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchNameInput, setSearchNameInput] = useState("");
  const [searchName, setSearchName] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const fetchPlayers = useCallback(
    async (page = 1, nameQuery = searchName) => {
      setLoading(true);

      try {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("pageSize", String(pageSize));

        if (nameQuery.trim()) {
          params.set("name", nameQuery.trim());
        }

        const res = await fetch(`/api/players?${params.toString()}`, {
          cache: "no-store",
        });

        const data = await parseResponse<PlayersListResponse | { message?: string }>(res);

        if (!res.ok) {
          const message = data && "message" in data ? data.message : "플레이어 목록 조회에 실패했습니다.";
          alert(message);
          setPlayers([]);
          setCurrentPage(1);
          setTotalPages(1);
          setTotalCount(0);
          return;
        }

        const listData = data as PlayersListResponse;
        setPlayers(Array.isArray(listData.items) ? listData.items : []);
        setCurrentPage(listData.currentPage ?? 1);
        setTotalPages(listData.totalPages ?? 1);
        setTotalCount(listData.totalCount ?? 0);
      } catch (error) {
        console.error("플레이어 목록 조회 실패:", error);
        alert("플레이어 목록 조회에 실패했습니다.");
        setPlayers([]);
        setCurrentPage(1);
        setTotalPages(1);
        setTotalCount(0);
      } finally {
        setLoading(false);
      }
    },
    [pageSize, searchName],
  );

  useEffect(() => {
    void fetchPlayers(1, "");
  }, [fetchPlayers]);

  async function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextSearch = searchNameInput.trim();
    setSearchName(nextSearch);
    await fetchPlayers(1, nextSearch);
  }

  async function handleSearchReset() {
    setSearchNameInput("");
    setSearchName("");
    await fetchPlayers(1, "");
  }

  async function handlePageChange(page: number) {
    await fetchPlayers(page, searchName);
  }

  async function handleDeactivate(player: Player) {
    const confirmed = window.confirm(
      `${player.name} (${player.nickname}#${player.tag}) 플레이어를 비활성화하시겠습니까?\n기존 경기/통계 기록은 보존됩니다.`,
    );
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/players/${player.id}`, { method: "DELETE" });
      const result = await parseResponse<{ message?: string }>(res);

      if (!res.ok) {
        alert(result?.message ?? "비활성화에 실패했습니다.");
        return;
      }

      const nextTotalCount = Math.max(totalCount - 1, 0);
      const nextTotalPages = Math.max(Math.ceil(nextTotalCount / pageSize), 1);
      const nextPage = Math.min(currentPage, nextTotalPages);
      await fetchPlayers(nextPage, searchName);
      alert(result?.message ?? "플레이어가 비활성화되었습니다.");
    } catch (error) {
      console.error("플레이어 비활성화 실패:", error);
      alert("플레이어 비활성화 중 오류가 발생했습니다.");
    }
  }

  return (
    <main className="page-container">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 6 }}>플레이어 관리</h1>
          <p className="page-description" style={{ margin: 0 }}>
            회원가입은 자동 승인입니다. 플레이어 수정, 계정 정보, 권한/보안 관리는 각 플레이어 상세에서 처리합니다.
          </p>
        </div>
        <Link href="/admin/players/new" className="app-button">플레이어 등록</Link>
      </div>

      <section className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#ffffff" }}>플레이어 목록</h2>
          <form onSubmit={handleSearchSubmit} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input
              value={searchNameInput}
              onChange={(e) => setSearchNameInput(e.target.value)}
              placeholder="이름으로 검색"
              className="app-input"
              style={{ minWidth: 220 }}
            />
            <button type="submit" className="chip-button" style={{ minWidth: 72 }}>검색</button>
            <button type="button" className="chip-button" onClick={handleSearchReset} style={{ minWidth: 72 }}>초기화</button>
          </form>
        </div>

        <div style={{ marginBottom: 12, fontSize: 14, color: "#9ca3af" }}>
          총 {totalCount}명{searchName ? ` · 이름 검색: "${searchName}"` : ""}
        </div>

        <div className="admin-player-row-header" style={{ gridTemplateColumns: "0.9fr 1.2fr 0.85fr 0.85fr 1.05fr 0.8fr 1.1fr" }}>
          <div>이름</div>
          <div>닉네임#태그</div>
          <div>최고 티어</div>
          <div>현재 티어</div>
          <div>사이트 계정</div>
          <div>상태</div>
          <div>관리</div>
        </div>

        {loading ? (
          <div style={{ padding: "16px 0" }}>불러오는 중...</div>
        ) : players.length === 0 ? (
          <div style={{ padding: "16px 0" }}>{searchName ? "검색된 플레이어가 없습니다." : "등록된 플레이어가 없습니다."}</div>
        ) : (
          <>
            <div className="card-grid" style={{ marginTop: 12 }}>
              {players.map((player) => (
                <div key={player.id} className="admin-player-row-card">
                  <div className="admin-player-row-grid" style={{ gridTemplateColumns: "0.9fr 1.2fr 0.85fr 0.85fr 1.05fr 0.8fr 1.1fr" }}>
                    <div className="player-col player-name">{player.name}</div>
                    <div className="player-col">{player.nickname}#{player.tag}</div>
                    <div className="player-col">{player.peakTier ?? "-"}</div>
                    <div className="player-col">{player.currentTier ?? "-"}</div>
                    <div className="player-col">{player.userAccount ? maskUserId(player.userAccount.userId) : "미연결"}</div>
                    <div className="player-col">{player.userAccount ? getStatusLabel(player.userAccount.status) : "계정 없음"}</div>
                    <div className="admin-player-actions">
                      <Link className="chip-button" href={`/admin/players/${player.id}`}>상세</Link>
                      <button type="button" className="chip-button chip-button--danger" onClick={() => handleDeactivate(player)}>비활성</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={handlePageChange} />
          </>
        )}
      </section>
    </main>
  );
}

function maskUserId(userId: string) {
  const value = String(userId ?? "").trim();
  if (!value) return "-";
  if (value.length <= 3) return value;
  return `${value.slice(0, 3)}***`;
}

function getStatusLabel(status: string) {
  if (status === "APPROVED") return "자동 승인";
  if (status === "PENDING") return "대기";
  if (status === "REJECTED") return "거절";
  return status || "-";
}
