"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AdminPlayerCreatePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [tag, setTag] = useState("");

  const handleSubmit = async () => {
    const response = await fetch("/api/players", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name, nickname, tag }),
    });

    const data = await response.json();

    if (!response.ok) {
      alert(data.message ?? "등록 실패");
      return;
    }

    alert("등록되었습니다.");
    router.push("/admin/players");
    router.refresh();
  };

  return (
    <main className="page-container">
      <h1 className="page-title">플레이어 등록</h1>

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

            <button className="app-button" type="button" onClick={handleSubmit}>
              등록
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}