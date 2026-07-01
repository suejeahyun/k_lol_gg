"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Target = {
  userAccountId: number | null;
  playerId: number | null;
  userId: string;
  name: string;
  nickname: string | null;
  tag: string | null;
  label: string;
};

const sourceOptions = [
  ["MANUAL", "운영자 수동"],
  ["LATE", "구인/내전 지각"],
  ["NO_SHOW", "노쇼"],
  ["CHAT_ABUSE", "전챗/감정표현"],
  ["TOXICITY", "욕설/남탓/훈수"],
  ["LINE_FORM", "라인 기재 문제"],
  ["OTHER", "기타"],
];

export default function DisciplineRecordCreateClient({ targets }: { targets: Target[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [targetMode, setTargetMode] = useState<"REGISTERED" | "DIRECT">("REGISTERED");
  const [targetKey, setTargetKey] = useState(targets[0] ? `${targets[0].userAccountId || ""}:${targets[0].playerId || ""}` : "");
  const [directName, setDirectName] = useState("");
  const [directNickname, setDirectNickname] = useState("");
  const [directTag, setDirectTag] = useState("");
  const [type, setType] = useState("CAUTION");
  const [source, setSource] = useState("MANUAL");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const filteredTargets = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return targets.slice(0, 80);
    return targets.filter((item) => item.label.toLowerCase().includes(q)).slice(0, 80);
  }, [query, targets]);

  const selectedTarget = targets.find((item) => `${item.userAccountId || ""}:${item.playerId || ""}` === targetKey) || null;

  async function submit() {
    if (!reason.trim()) {
      alert("사유를 입력해주세요.");
      return;
    }
    if (targetMode === "REGISTERED" && !selectedTarget) {
      alert("등록된 대상을 선택하거나 직접 입력으로 전환해주세요.");
      return;
    }
    if (targetMode === "DIRECT" && !directName.trim()) {
      alert("사이트에 등록되지 않은 대상은 이름을 직접 입력해야 합니다.");
      return;
    }

    setBusy(true);
    try {
      const payload = targetMode === "REGISTERED" ? {
        userAccountId: selectedTarget?.userAccountId || null,
        playerId: selectedTarget?.playerId || null,
        targetName: selectedTarget?.name || "대상 미상",
        targetNickname: selectedTarget?.nickname || null,
        targetTag: selectedTarget?.tag || null,
      } : {
        userAccountId: null,
        playerId: null,
        targetName: directName.trim(),
        targetNickname: directNickname.trim() || null,
        targetTag: directTag.trim() || null,
      };

      const res = await fetch("/api/admin/discipline-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, type, source, reason, note }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "저장 실패");
      router.push("/admin/discipline");
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "저장 실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-card discipline-form-card">
      <h2>주의/경고 등록</h2>
      <p className="admin-muted discipline-help">대상은 사이트 등록 유저 검색 또는 이름·닉네임 직접 입력으로 등록할 수 있습니다.</p>
      <div className="discipline-mode-row">
        <button type="button" className={`admin-button ${targetMode === "REGISTERED" ? "" : "admin-button--secondary"}`} onClick={() => setTargetMode("REGISTERED")}>사이트 등록 대상 검색</button>
        <button type="button" className={`admin-button ${targetMode === "DIRECT" ? "" : "admin-button--secondary"}`} onClick={() => setTargetMode("DIRECT")}>이름·닉네임 직접 등록</button>
      </div>
      <div className="discipline-form-grid">
        {targetMode === "REGISTERED" ? (
          <>
            <label>대상 검색<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="아이디, 이름, 닉네임 검색" /></label>
            <label>대상<select value={targetKey} onChange={(e) => setTargetKey(e.target.value)}>{filteredTargets.length === 0 ? <option value="">검색 결과 없음 — 직접 등록을 사용하세요</option> : filteredTargets.map((target) => <option key={`${target.userAccountId || ""}:${target.playerId || ""}`} value={`${target.userAccountId || ""}:${target.playerId || ""}`}>{target.label}</option>)}</select></label>
          </>
        ) : (
          <>
            <label>이름<input value={directName} onChange={(e) => setDirectName(e.target.value)} placeholder="예: 정민" /></label>
            <label>닉네임<input value={directNickname} onChange={(e) => setDirectNickname(e.target.value)} placeholder="예: 원죄" /></label>
            <label>태그<input value={directTag} onChange={(e) => setDirectTag(e.target.value)} placeholder="예: KR1 / 미입력 가능" /></label>
            <div className="discipline-direct-note">사이트 계정·플레이어가 없는 대상도 이름과 닉네임으로 기록됩니다.</div>
          </>
        )}
        <label>종류<select value={type} onChange={(e) => setType(e.target.value)}><option value="CAUTION">주의</option><option value="WARNING">경고</option></select></label>
        <label>사유 유형<select value={source} onChange={(e) => setSource(e.target.value)}>{sourceOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="discipline-wide">사유<textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="예: 내전 시작 10분 전 미입장 / 노쇼 / 전챗 조롱" /></label>
        <label className="discipline-wide">메모<textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="운영진 내부 참고 메모" /></label>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button className="admin-button" disabled={busy} onClick={() => void submit()}>{busy ? "저장 중" : "등록"}</button>
        <button className="admin-button admin-button--secondary" type="button" onClick={() => router.push("/admin/discipline")}>목록</button>
      </div>
    </section>
  );
}
