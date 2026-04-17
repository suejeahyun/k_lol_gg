"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  player: {
    id: number;
    name: string;
    nickname: string;
    tag: string;
  };
};

export default function EditPlayerClient({ player }: Props) {
  const router = useRouter();

  const [name, setName] = useState(player.name);
  const [nickname, setNickname] = useState(player.nickname);
  const [tag, setTag] = useState(player.tag);
  const [loading, setLoading] = useState(false);

  const handleUpdate = async () => {
    try {
      setLoading(true);

      const response = await fetch(`/api/players/${player.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          nickname,
          tag,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.message ?? "수정 실패");
        return;
      }

      alert("수정되었습니다.");
      router.push("/admin/players");
      router.refresh();
    } catch (error) {
      console.error(error);
      alert("수정 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    const ok = window.confirm("정말 이 플레이어를 삭제하시겠습니까?");
    if (!ok) {
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(`/api/players/${player.id}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.message ?? "삭제 실패");
        return;
      }

      alert("삭제되었습니다.");
      router.push("/admin/players");
      router.refresh();
    } catch (error) {
      console.error(error);
      alert("삭제 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="page-container">
      <h1 className="page-title">플레이어 수정</h1>

      <div className="card-grid">
        <div className="card">
          <div className="detail-board__title">기본 정보</div>

          <div style={{ display: "grid", gap: "16px" }}>
            <div>
              <label>이름</label>
              <input
                className="app-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{ width: "100%", marginTop: "8px" }}
              />
            </div>

            <div>
              <label>닉네임</label>
              <input
                className="app-input"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                style={{ width: "100%", marginTop: "8px" }}
              />
            </div>

            <div>
              <label>태그</label>
              <input
                className="app-input"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                style={{ width: "100%", marginTop: "8px" }}
              />
            </div>

            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button
                className="app-button"
                type="button"
                onClick={handleUpdate}
                disabled={loading}
              >
                수정 저장
              </button>

              <button
                className="chip-button chip-button--danger"
                type="button"
                onClick={handleDelete}
                disabled={loading}
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}