"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SeasonCreateForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    try {
      setLoading(true);

      const response = await fetch("/api/seasons", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.message ?? "시즌 생성에 실패했습니다.");
        return;
      }

      setName("");
      alert("시즌이 생성되었습니다.");
      router.refresh();
    } catch (error) {
      console.error(error);
      alert("시즌 생성 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card section-block">
      <div className="list-card__title">시즌 생성</div>

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <input
          className="app-input"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: 2026 Spring"
          style={{ width: "260px" }}
        />

        <button
          type="button"
          className="app-button"
          onClick={handleCreate}
          disabled={loading}
        >
          {loading ? "생성 중..." : "시즌 생성"}
        </button>
      </div>
    </div>
  );
}