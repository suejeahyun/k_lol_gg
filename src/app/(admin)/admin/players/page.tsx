"use client";

import { useEffect, useMemo, useState } from "react";

type Player = {
  id: number;
  name: string;
  nickname: string;
  tag: string;
  peakTier: string | null;
  currentTier: string | null;
  createdAt: string;
};

type TierType = "basic" | "master" | "high";

const BASIC_TIERS = [
  "아이언",
  "브론즈",
  "실버",
  "골드",
  "플래티넘",
  "에메랄드",
  "다이아",
];

const MASTER_TIERS = ["마스터"];
const HIGH_TIERS = ["그랜드마스터", "챌린저"];

const BASIC_DIVISIONS = ["1", "2", "3", "4"];
const MASTER_FLOORS = Array.from({ length: 10 }, (_, i) => String(i + 1));

function getTierType(tier: string): TierType {
  if (BASIC_TIERS.includes(tier)) return "basic";
  if (MASTER_TIERS.includes(tier)) return "master";
  return "high";
}

function buildTierValue(tier: string, detail: string) {
  if (!tier) return "";

  if (BASIC_TIERS.includes(tier)) {
    return detail ? `${tier} ${detail}` : "";
  }

  if (MASTER_TIERS.includes(tier)) {
    return detail ? `${tier} ${detail}층` : "";
  }

  if (HIGH_TIERS.includes(tier)) {
    return detail ? `${tier} ${detail}` : "";
  }

  return "";
}

function parseTierValue(value?: string | null): {
  tier: string;
  detail: string;
  type: TierType;
} {
  const normalized = value?.trim() ?? "";

  if (!normalized) {
    return {
      tier: "",
      detail: "",
      type: "basic",
    };
  }

  const [first, second] = normalized.split(" ");

  if (BASIC_TIERS.includes(first)) {
    return {
      tier: first,
      detail: second ?? "",
      type: "basic",
    };
  }

  if (MASTER_TIERS.includes(first)) {
    return {
      tier: first,
      detail: (second ?? "").replace("층", ""),
      type: "master",
    };
  }

  if (HIGH_TIERS.includes(first)) {
    return {
      tier: first,
      detail: second ?? "",
      type: "high",
    };
  }

  return {
    tier: "",
    detail: "",
    type: "basic",
  };
}

export default function AdminPlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);

  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [tag, setTag] = useState("");

  const [peakTier, setPeakTier] = useState("");
  const [peakDetail, setPeakDetail] = useState("");

  const [currentTier, setCurrentTier] = useState("");
  const [currentDetail, setCurrentDetail] = useState("");

  const peakType = useMemo(() => getTierType(peakTier), [peakTier]);
  const currentType = useMemo(() => getTierType(currentTier), [currentTier]);

  async function fetchPlayers() {
    setLoading(true);

    try {
      const res = await fetch("/api/players", {
        cache: "no-store",
      });

      const data = (await res.json()) as Player[];
      setPlayers(data);
    } catch (error) {
      console.error("플레이어 목록 조회 실패:", error);
      alert("플레이어 목록 조회에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchPlayers();
  }, []);

  function resetForm() {
    setEditingId(null);
    setName("");
    setNickname("");
    setTag("");
    setPeakTier("");
    setPeakDetail("");
    setCurrentTier("");
    setCurrentDetail("");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!name.trim() || !nickname.trim() || !tag.trim()) {
      alert("이름, 닉네임, 태그를 모두 입력해주세요.");
      return;
    }

    setSaving(true);

    try {
      const payload = {
        name: name.trim(),
        nickname: nickname.trim(),
        tag: tag.trim(),
        peakTier: buildTierValue(peakTier, peakDetail) || null,
        currentTier: buildTierValue(currentTier, currentDetail) || null,
      };

      const url = editingId ? `/api/players/${editingId}` : "/api/players";
      const method = editingId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = await res.json();

      if (!res.ok) {
        alert(result.message ?? "저장에 실패했습니다.");
        return;
      }

      resetForm();
      await fetchPlayers();
    } catch (error) {
      console.error("플레이어 저장 실패:", error);
      alert("플레이어 저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  function handleEdit(player: Player) {
    setEditingId(player.id);
    setName(player.name);
    setNickname(player.nickname);
    setTag(player.tag);

    const parsedPeak = parseTierValue(player.peakTier);
    setPeakTier(parsedPeak.tier);
    setPeakDetail(parsedPeak.detail);

    const parsedCurrent = parseTierValue(player.currentTier);
    setCurrentTier(parsedCurrent.tier);
    setCurrentDetail(parsedCurrent.detail);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  async function handleDelete(playerId: number) {
    const confirmed = window.confirm("해당 플레이어를 삭제하시겠습니까?");
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/players/${playerId}`, {
        method: "DELETE",
      });

      const result = await res.json();

      if (!res.ok) {
        alert(result.message ?? "삭제에 실패했습니다.");
        return;
      }

      if (editingId === playerId) {
        resetForm();
      }

      await fetchPlayers();
    } catch (error) {
      console.error("플레이어 삭제 실패:", error);
      alert("플레이어 삭제 중 오류가 발생했습니다.");
    }
  }

  return (
    <main className="page-container">
      <h1 className="page-title">플레이어 관리</h1>

      <form onSubmit={handleSubmit} className="card admin-player-form">
        <h2 className="admin-player-form__title">
          {editingId ? "플레이어 수정" : "플레이어 등록"}
        </h2>

        <div className="admin-player-form__grid">
          <div className="admin-player-form__field">
            <label htmlFor="player-name">이름</label>
            <input
              id="player-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="이름 입력"
            />
          </div>

          <div className="admin-player-form__field">
            <label htmlFor="player-nickname">닉네임</label>
            <input
              id="player-nickname"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="닉네임 입력"
            />
          </div>

          <div className="admin-player-form__field">
            <label htmlFor="player-tag">태그</label>
            <input
              id="player-tag"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              placeholder="태그 입력"
            />
          </div>
        </div>

        <div className="admin-player-form__section">
          <div className="admin-player-form__section-title">최대 티어</div>

          <div className="admin-player-form__tier-row">
            <select
              value={peakTier}
              onChange={(e) => {
                setPeakTier(e.target.value);
                setPeakDetail("");
              }}
            >
              <option value="">선택 안함</option>
              {[...BASIC_TIERS, ...MASTER_TIERS, ...HIGH_TIERS].map((tier) => (
                <option key={tier} value={tier}>
                  {tier}
                </option>
              ))}
            </select>

            {peakTier && peakType === "basic" && (
              <select
                value={peakDetail}
                onChange={(e) => setPeakDetail(e.target.value)}
              >
                <option value="">단계 선택</option>
                {BASIC_DIVISIONS.map((division) => (
                  <option key={division} value={division}>
                    {division}
                  </option>
                ))}
              </select>
            )}

            {peakTier && peakType === "master" && (
              <select
                value={peakDetail}
                onChange={(e) => setPeakDetail(e.target.value)}
              >
                <option value="">층 선택</option>
                {MASTER_FLOORS.map((floor) => (
                  <option key={floor} value={floor}>
                    {floor}층
                  </option>
                ))}
              </select>
            )}

            {peakTier && peakType === "high" && (
              <input
                value={peakDetail}
                onChange={(e) =>
                  setPeakDetail(e.target.value.replace(/[^0-9]/g, ""))
                }
                placeholder="숫자 입력"
                inputMode="numeric"
              />
            )}
          </div>
        </div>

        <div className="admin-player-form__section">
          <div className="admin-player-form__section-title">현재 티어</div>

          <div className="admin-player-form__tier-row">
            <select
              value={currentTier}
              onChange={(e) => {
                setCurrentTier(e.target.value);
                setCurrentDetail("");
              }}
            >
              <option value="">선택 안함</option>
              {[...BASIC_TIERS, ...MASTER_TIERS, ...HIGH_TIERS].map((tier) => (
                <option key={tier} value={tier}>
                  {tier}
                </option>
              ))}
            </select>

            {currentTier && currentType === "basic" && (
              <select
                value={currentDetail}
                onChange={(e) => setCurrentDetail(e.target.value)}
              >
                <option value="">단계 선택</option>
                {BASIC_DIVISIONS.map((division) => (
                  <option key={division} value={division}>
                    {division}
                  </option>
                ))}
              </select>
            )}

            {currentTier && currentType === "master" && (
              <select
                value={currentDetail}
                onChange={(e) => setCurrentDetail(e.target.value)}
              >
                <option value="">층 선택</option>
                {MASTER_FLOORS.map((floor) => (
                  <option key={floor} value={floor}>
                    {floor}층
                  </option>
                ))}
              </select>
            )}

            {currentTier && currentType === "high" && (
              <input
                value={currentDetail}
                onChange={(e) =>
                  setCurrentDetail(e.target.value.replace(/[^0-9]/g, ""))
                }
                placeholder="숫자 입력"
                inputMode="numeric"
              />
            )}
          </div>
        </div>

        <div className="admin-player-form__actions">
          <button
            type="submit"
            className="admin-player-form__submit"
            disabled={saving}
          >
            {saving ? "저장 중..." : editingId ? "수정하기" : "등록하기"}
          </button>

          {editingId && (
            <button
              type="button"
              className="admin-player-form__cancel"
              onClick={resetForm}
            >
              취소
            </button>
          )}
        </div>
      </form>

      <section className="card">
        <h2
          style={{
            margin: "0 0 16px",
            fontSize: "20px",
            fontWeight: 800,
            color: "#000",
          }}
        >
          플레이어 목록
        </h2>

        <div
          className="player-row-header admin-player-row-header"
          style={{
            gridTemplateColumns: "1.2fr 1.2fr 1fr 1fr 1fr",
          }}
        >
          <div>이름</div>
          <div>닉네임#태그</div>
          <div>최대 티어</div>
          <div>현재 티어</div>
          <div style={{ textAlign: "right" }}>관리</div>
        </div>

        {loading ? (
          <div style={{ padding: "16px 0" }}>불러오는 중...</div>
        ) : players.length === 0 ? (
          <div style={{ padding: "16px 0" }}>등록된 플레이어가 없습니다.</div>
        ) : (
          <div className="card-grid" style={{ marginTop: 12 }}>
            {players.map((player) => (
              <div key={player.id} className="admin-player-row-card">
                <div
                  className="admin-player-row-grid"
                  style={{
                    gridTemplateColumns: "1.2fr 1.2fr 1fr 1fr 1fr",
                  }}
                >
                  <div className="player-col player-name">{player.name}</div>
                  <div className="player-col">
                    {player.nickname}#{player.tag}
                  </div>
                  <div className="player-col">{player.peakTier ?? "-"}</div>
                  <div className="player-col">{player.currentTier ?? "-"}</div>

                  <div className="admin-player-actions">
                    <button
                      type="button"
                      className="chip-button"
                      onClick={() => handleEdit(player)}
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      className="chip-button chip-button--danger"
                      onClick={() => handleDelete(player.id)}
                    >
                      삭제
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}