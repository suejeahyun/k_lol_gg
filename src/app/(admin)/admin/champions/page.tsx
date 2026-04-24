"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

type ChampionItem = {
  id: number;
  name: string;
  imageUrl: string;
  createdAt?: string;
};

const PAGE_SIZE = 10;

export default function AdminChampionsPage() {
  const [champions, setChampions] = useState<ChampionItem[]>([]);
  const [name, setName] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [page, setPage] = useState(1);

  const fetchChampions = async () => {
    const res = await fetch("/api/champions", { cache: "no-store" });

    if (!res.ok) {
      alert("챔피언 목록 조회 실패");
      return;
    }

    const data = await res.json();
    setChampions(data);
  };

  useEffect(() => {
    fetchChampions();
  }, []);

  const totalPages = Math.max(1, Math.ceil(champions.length / PAGE_SIZE));

  const paginatedChampions = useMemo(() => {
    const startIndex = (page - 1) * PAGE_SIZE;
    return champions.slice(startIndex, startIndex + PAGE_SIZE);
  }, [champions, page]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const handleCreate = async () => {
    const res = await fetch("/api/champions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name, imageUrl }),
    });

    if (!res.ok) {
      const error = await res.json().catch(() => null);
      alert(error?.message ?? "챔피언 등록 실패");
      return;
    }

    setName("");
    setImageUrl("");
    setPage(1);
    await fetchChampions();
  };

  const handleEdit = async (champion: ChampionItem) => {
    const nextName = window.prompt("챔피언명 수정", champion.name);
    if (!nextName) return;

    const nextImageUrl = window.prompt("이미지 URL 수정", champion.imageUrl);
    if (!nextImageUrl) return;

    const res = await fetch(`/api/champions/${champion.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: nextName,
        imageUrl: nextImageUrl,
      }),
    });

    if (!res.ok) {
      const error = await res.json().catch(() => null);
      alert(error?.message ?? "챔피언 수정 실패");
      return;
    }

    await fetchChampions();
  };

  const handleDelete = async (id: number) => {
    const ok = window.confirm("정말 삭제하시겠습니까?");
    if (!ok) return;

    const res = await fetch(`/api/champions/${id}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      const error = await res.json().catch(() => null);
      alert(error?.message ?? "챔피언 삭제 실패");
      return;
    }

    await fetchChampions();
  };

  return (
    <div className="page-container">
      <h1 className="page-title">챔피언 관리</h1>

      <div className="card section-block">
        <div className="section-search" style={{ display: "grid", gap: "12px" }}>
          <input
            className="app-input"
            style={{ width: "100%" }}
            placeholder="챔피언 이름"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="app-input"
            style={{ width: "100%" }}
            placeholder="이미지 URL"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
          />
          <div>
            <button className="app-button" type="button" onClick={handleCreate}>
              챔피언 등록
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="player-row-header admin-player-row-header">
          <div>챔피언</div>
          <div>이미지</div>
          <div>생성일</div>
          <div style={{ textAlign: "right" }}>관리</div>
        </div>

        <div className="card-grid">
          {paginatedChampions.map((champion) => (
            <div key={champion.id} className="admin-player-row-card">
              <div className="admin-player-row-grid">
                <div className="player-col player-name">{champion.name}</div>

                <div className="player-col">
                  <Image
                    src={champion.imageUrl}
                    alt={champion.name}
                    width={40}
                    height={40}
                  />
                </div>

                <div className="player-col">
                  {champion.createdAt
                    ? new Date(champion.createdAt).toLocaleDateString("ko-KR")
                    : "-"}
                </div>

                <div className="admin-player-actions">
                  <button
                    className="chip-button"
                    type="button"
                    onClick={() => handleEdit(champion)}
                  >
                    수정
                  </button>
                  <button
                    className="chip-button chip-button--danger"
                    type="button"
                    onClick={() => handleDelete(champion.id)}
                  >
                    삭제
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {champions.length > PAGE_SIZE && (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: "8px",
              marginTop: "20px",
            }}
          >
            <button
              className="chip-button"
              type="button"
              disabled={page === 1}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            >
              이전
            </button>

            {Array.from({ length: totalPages }, (_, index) => {
              const pageNumber = index + 1;

              return (
                <button
                  key={pageNumber}
                  className="chip-button"
                  type="button"
                  onClick={() => setPage(pageNumber)}
                  style={{
                    fontWeight: page === pageNumber ? 800 : 500,
                    borderColor: page === pageNumber ? "#111" : undefined,
                  }}
                >
                  {pageNumber}
                </button>
              );
            })}

            <button
              className="chip-button"
              type="button"
              disabled={page === totalPages}
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            >
              다음
            </button>
          </div>
        )}
      </div>
    </div>
  );
}