"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AdminPlayerCreatePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [tag, setTag] = useState("");
  const [peakTier, setPeakTier] = useState("");
  const [currentTier, setCurrentTier] = useState("");

  const handleSubmit = async () => {
    if (!name.trim() || !nickname.trim() || !tag.trim()) {
      alert("이름, 닉네임, 태그를 모두 입력해주세요.");
      return;
    }

    try {
      setLoading(true);
      const response = await fetch("/api/players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          nickname: nickname.trim(),
          tag: tag.replace(/^#/, "").trim(),
          peakTier: peakTier.trim() || null,
          currentTier: currentTier.trim() || null,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        alert(data.message ?? "플레이어 등록에 실패했습니다.");
        return;
      }

      alert(data.message ?? "플레이어가 등록되었습니다.");
      router.push("/admin/players");
      router.refresh();
    } catch (error) {
      console.error("[ADMIN_PLAYER_CREATE_ERROR]", error);
      alert("플레이어 등록 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="page-container">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 6 }}>플레이어 등록</h1>
          <p className="page-description" style={{ margin: 0 }}>관리자가 수동으로 플레이어를 추가합니다. 사이트 가입자는 자동 승인됩니다.</p>
        </div>
        <Link href="/admin/players" className="chip-button">목록으로</Link>
      </div>

      <section className="card" style={{ maxWidth: 760 }}>
        <div style={{ display: "grid", gap: 16 }}>
          <Field label="이름" value={name} onChange={setName} />
          <Field label="닉네임" value={nickname} onChange={setNickname} />
          <Field label="태그" value={tag} onChange={setTag} placeholder="예: KR1 또는 1234" />
          <Field label="최고티어" value={peakTier} onChange={setPeakTier} placeholder="예: 다이아 2, 마스터 3층" />
          <Field label="현재티어" value={currentTier} onChange={setCurrentTier} placeholder="예: 에메랄드 1" />

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="app-button" type="button" onClick={handleSubmit} disabled={loading}>
              {loading ? "등록 중..." : "등록"}
            </button>
            <Link href="/admin/players" className="chip-button">취소</Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <div>
      <label style={{ fontWeight: 800 }}>{label}</label>
      <input aria-label={placeholder} className="app-input" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={{ width: "100%", marginTop: 8 }} />
    </div>
  );
}
