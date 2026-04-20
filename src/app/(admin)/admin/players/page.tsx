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
const MASTER_FLOORS = Array.from({ length: 10 }, (_, i) => `${i + 1}`);

function parseTierValue(value?: string | null): {
  tier: string;
  detail: string;
  type: TierType;
} {
  const normalized = value?.trim() ?? "";

  if (!normalized) {
    return { tier: "", detail: "", type: "basic" };
  }

  const [first, second] = normalized.split(" ");

  if (BASIC_TIERS.includes(first)) {
    return { tier: first, detail: second ?? "", type: "basic" };
  }

  if (MASTER_TIERS.includes(first)) {
    return {
      tier: first,
      detail: (second ?? "").replace("층", ""),
      type: "master",
    };
  }

  if (HIGH_TIERS.includes(first)) {
    return { tier: first, detail: second ?? "", type: "high" };
  }

  return { tier: "", detail: "", type: "basic" };
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

function getTierType(tier: string): TierType {
  if (BASIC_TIERS.includes(tier)) return "basic";
  if (MASTER_TIERS.includes(tier)) return "master";
  return "high";
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
      const res = await fetch("/api/players", { cache: "no-store" });
      const data = (await res.json()) as Player[];
      setPlayers(data);
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

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);

    try {
      const payload = {
        name,
        nickname,
        tag,
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

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(id: number) {
    const ok = window.confirm("정말 삭제하시겠습니까?");
    if (!ok) return;

    const res = await fetch(`/api/players/${id}`, {
      method: "DELETE",
    });

    const result = await res.json();

    if (!res.ok) {
      alert(result.message ?? "삭제에 실패했습니다.");
      return;
    }

    if (editingId === id) {
      resetForm();
    }

    await fetchPlayers();
  }

  return (
    <main className="page-container">
      <h1 className="page-title">플레이어 관리</h1>

      <form onSubmit={handleSubmit} className="card" style={{ marginBottom: 24 }}>
        <h2 style={{ marginBottom: 16 }}>
          {editingId ? "플레이어 수정" : "플레이어 등록"}
        </h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 12,
            marginBottom: 12,
          }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="이름"
            className="input"
          />
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="닉네임"
            className="input"
          />
          <input
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder="태그"
            className="input"
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>최대 티어</div>
          <div style={{ display: "flex", gap: 12 }}>
            <select
              value={peakTier}
              onChange={(e) => {
                setPeakTier(e.target.value);
                setPeakDetail("");
              }}
              className="input"
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
                className="input"
              >
                <option value="">단계 선택</option>
                {BASIC_DIVISIONS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            )}

            {peakTier && peakType === "master" && (
              <select
                value={peakDetail}
                onChange={(e) => setPeakDetail(e.target.value)}
                className="input"
              >
                <option value="">층 선택</option>
                {MASTER_FLOORS.map((v) => (
                  <option key={v} value={v}>
                    {v}층
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
                className="input"
                inputMode="numeric"
              />
            )}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>현재 티어</div>
          <div style={{ display: "flex", gap: 12 }}>
            <select
              value={currentTier}
              onChange={(e) => {
                setCurrentTier(e.target.value);
                setCurrentDetail("");
              }}
              className="input"
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
                className="input"
              >
                <option value="">단계 선택</option>
                {BASIC_DIVISIONS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            )}

            {currentTier && currentType === "master" && (
              <select
                value={currentDetail}
                onChange={(e) => setCurrentDetail(e.target.value)}
                className="input"
              >
                <option value="">층 선택</option>
                {MASTER_FLOORS.map((v) => (
                  <option key={v} value={v}>
                    {v}층
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
                className="input"
                inputMode="numeric"
              />
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          <button type="submit" className="button" disabled={saving}>
            {saving ? "저장 중..." : editingId ? "수정하기" : "등록하기"}
          </button>

          {editingId && (
            <button
              type="button"
              className="button"
              onClick={resetForm}
            >
              취소
            </button>
          )}
        </div>
      </form>

      <div className="card">
        <h2 style={{ marginBottom: 16 }}>플레이어 목록</h2>

        {loading ? (
          <div>불러오는 중...</div>
        ) : players.length === 0 ? (
          <div>등록된 플레이어가 없습니다.</div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {players.map((player) => (
              <div
                key={player.id}
                style={{
                  border: "1px solid #2a2a2a",
                  borderRadius: 12,
                  padding: 16,
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 8 }}>
                  {player.name}
                </div>
                <div>닉네임: {player.nickname}#{player.tag}</div>
                <div>최대 티어: {player.peakTier ?? "-"}</div>
                <div>현재 티어: {player.currentTier ?? "-"}</div>

                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button
                    type="button"
                    className="button"
                    onClick={() => handleEdit(player)}
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    className="button"
                    onClick={() => handleDelete(player.id)}
                  >
                    삭제
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}