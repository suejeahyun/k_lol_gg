"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  player: {
    id: number;
    name: string;
    nickname: string;
    tag: string;
    peakTier?: string | null;
    currentTier?: string | null;
    balanceOverrideScore?: number | null;
    balanceOverrideReason?: string | null;
  };
};

export default function EditPlayerClient({ player }: Props) {
  const router = useRouter();

  const [name, setName] = useState(player.name);
  const [nickname, setNickname] = useState(player.nickname);
  const [tag, setTag] = useState(player.tag);
  const [peakTier, setPeakTier] = useState(player.peakTier ?? "");
  const [currentTier, setCurrentTier] = useState(player.currentTier ?? "");
  const [balanceOverrideScore, setBalanceOverrideScore] = useState(
    String(player.balanceOverrideScore ?? 0),
  );
  const [balanceOverrideReason, setBalanceOverrideReason] = useState(
    player.balanceOverrideReason ?? "",
  );
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
          peakTier,
          currentTier,
          balanceOverrideScore: Number(balanceOverrideScore || 0),
          balanceOverrideReason,
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
              <input aria-label="이름"
                className="app-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{ width: "100%", marginTop: "8px" }}
              />
            </div>

            <div>
              <label>닉네임</label>
              <input aria-label="닉네임"
                className="app-input"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                style={{ width: "100%", marginTop: "8px" }}
              />
            </div>

            <div>
              <label>태그</label>
              <input aria-label="태그"
                className="app-input"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                style={{ width: "100%", marginTop: "8px" }}
              />
            </div>

            <div>
              <label>최고티어</label>
              <input aria-label="예: 다이아 2, 마스터 3층"
                className="app-input"
                value={peakTier}
                onChange={(e) => setPeakTier(e.target.value)}
                placeholder="예: 다이아 2, 마스터 3층"
                style={{ width: "100%", marginTop: "8px" }}
              />
            </div>

            <div>
              <label>현재티어</label>
              <input aria-label="예: 에메랄드 1"
                className="app-input"
                value={currentTier}
                onChange={(e) => setCurrentTier(e.target.value)}
                placeholder="예: 에메랄드 1"
                style={{ width: "100%", marginTop: "8px" }}
              />
            </div>

            <div>
              <label>밸런스 수동 보정 점수 (-10 ~ +10)</label>
              <input aria-label="밸런스 수동 보정 점수 (-10 ~ +10)"
                className="app-input"
                type="number"
                min={-10}
                max={10}
                step={0.5}
                value={balanceOverrideScore}
                onChange={(e) => setBalanceOverrideScore(e.target.value)}
                style={{ width: "100%", marginTop: "8px" }}
              />
            </div>

            <div>
              <label>밸런스 보정 사유</label>
              <textarea aria-label="예: 최근 내전 체감 실력 +3, 휴면 복귀 -4"
                className="app-input"
                value={balanceOverrideReason}
                onChange={(e) => setBalanceOverrideReason(e.target.value)}
                placeholder="예: 최근 내전 체감 실력 +3, 휴면 복귀 -4"
                rows={3}
                style={{ width: "100%", marginTop: "8px", resize: "vertical" }}
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