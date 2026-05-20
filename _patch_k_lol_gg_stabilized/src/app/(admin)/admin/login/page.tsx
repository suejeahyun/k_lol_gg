"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AdminLoginPage() {
  const router = useRouter();
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    try {
      setLoading(true);

      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id,
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.message ?? "로그인에 실패했습니다.");
        return;
      }

      router.push("/admin/matches");
      router.refresh();
    } catch (error) {
      console.error(error);
      alert("로그인 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ padding: "24px", maxWidth: "480px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "28px", fontWeight: 700, marginBottom: "24px" }}>
        관리자 로그인
      </h1>

      <div style={{ display: "grid", gap: "16px" }}>
        <div>
          <label>아이디</label>
          <input
            type="text"
            value={id}
            onChange={(e) => setId(e.target.value)}
            style={{
              display: "block",
              width: "100%",
              marginTop: "8px",
              padding: "10px 12px",
              border: "1px solid #ccc",
              borderRadius: "8px",
            }}
          />
        </div>

        <div>
          <label>비밀번호</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              display: "block",
              width: "100%",
              marginTop: "8px",
              padding: "10px 12px",
              border: "1px solid #ccc",
              borderRadius: "8px",
            }}
          />
        </div>

        <button
          type="button"
          onClick={handleLogin}
          disabled={loading}
          style={{
            padding: "12px 16px",
            border: "1px solid #333",
            borderRadius: "8px",
            background: "#333",
            color: "#fff",
            cursor: "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "로그인 중..." : "로그인"}
        </button>
      </div>
    </main>
  );
}