"use client";

import { useMemo, useState } from "react";

type Target = {
  userAccountId: number | null;
  playerId: number | null;
  userId: string;
  name: string;
  nickname: string | null;
  tag: string | null;
  label: string;
};

type RecordItem = {
  id: number;
  userAccountId: number | null;
  playerId: number | null;
  targetName: string;
  targetNickname: string | null;
  targetTag: string | null;
  type: string;
  source: string;
  reason: string;
  note: string | null;
  isActive: boolean;
  resetAt: string | null;
  resetReason: string | null;
  createdBy: string | null;
  createdAt: string;
  userAccount?: { id: number; userId: string; role: string; status: string } | null;
  player?: { id: number; name: string; nickname: string; tag: string } | null;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function typeLabel(type: string) {
  if (type === "WARNING") return "경고";
  return "주의";
}

function sourceLabel(source: string) {
  const map: Record<string, string> = {
    MANUAL: "운영자 수동",
    LATE: "내전 지각",
    NO_SHOW: "내전 노쇼",
    CHAT_ABUSE: "전챗/감정표현",
    TOXICITY: "욕설/남탓/훈수",
    LINE_FORM: "라인 기재 문제",
    OTHER: "기타",
  };
  return map[source] || source;
}

function recordTargetLabel(record: RecordItem) {
  const name = record.player?.name || record.targetName;
  const nickname = record.player?.nickname || record.targetNickname;
  const tag = record.player?.tag || record.targetTag;
  const sub = nickname ? `${nickname}${tag ? `#${tag}` : ""}` : record.userAccount?.userId || "사이트 미등록";
  return { name, sub };
}

export default function DisciplineManagerClient({ targets, initialRecords }: { targets: Target[]; initialRecords: RecordItem[] }) {
  const [records, setRecords] = useState(initialRecords);
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

  const activeCautions = records.filter((item) => item.isActive && item.type === "CAUTION").length;
  const activeWarnings = records.filter((item) => item.isActive && item.type === "WARNING").length;
  const directActiveCount = records.filter((item) => item.isActive && !item.userAccountId && !item.playerId).length;

  const filteredTargets = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return targets.slice(0, 80);
    return targets.filter((item) => item.label.toLowerCase().includes(q)).slice(0, 80);
  }, [query, targets]);

  const selectedTarget = targets.find((item) => `${item.userAccountId || ""}:${item.playerId || ""}` === targetKey) || null;

  async function reload() {
    const res = await fetch("/api/admin/discipline-records", { cache: "no-store" });
    const data = await res.json();
    if (data?.records) setRecords(data.records);
  }

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
        body: JSON.stringify({
          ...payload,
          type,
          source,
          reason,
          note,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "저장 실패");
      setReason("");
      setNote("");
      if (targetMode === "DIRECT") {
        setDirectName("");
        setDirectNickname("");
        setDirectTag("");
      }
      await reload();
    } catch (error) {
      alert(error instanceof Error ? error.message : "저장 실패");
    } finally {
      setBusy(false);
    }
  }

  async function resetRecord(id: number) {
    if (!confirm("이 기록을 초기화하시겠습니까?")) return;
    await fetch(`/api/admin/discipline-records/${id}/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "운영자 개별 초기화" }),
    });
    await reload();
  }

  async function resetUser(userAccountId: number | null) {
    if (!userAccountId) return;
    if (!confirm("이 유저의 활성 주의/경고를 모두 초기화하시겠습니까?")) return;
    await fetch(`/api/admin/discipline-records/user/${userAccountId}/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "운영자 유저별 누적 초기화" }),
    });
    await reload();
  }

  async function resetDirectTarget(record: RecordItem) {
    if (record.userAccountId || record.playerId) return;
    if (!confirm(`${record.targetName} 대상의 활성 주의/경고를 모두 초기화하시겠습니까?`)) return;
    await fetch("/api/admin/discipline-records/target/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetName: record.targetName,
        targetNickname: record.targetNickname,
        targetTag: record.targetTag,
        reason: "운영자 직접 입력 대상 누적 초기화",
      }),
    });
    await reload();
  }

  return (
    <div className="discipline-page-shell">
      <section className="discipline-rule-card">
        <h2>운영 경고 기준</h2>
        <ol>
          <li>내전은 3판 2선을 기본으로 합니다. 진행이 어려우면 운영진에게 문의합니다.</li>
          <li>전챗 조롱, 감정표현, 인장 사용은 금지입니다. 실수 시 사과 후 자동 감정표현을 제외합니다.</li>
          <li>협곡내전은 언랭일 경우 임시티어라도 받은 뒤 캡처를 운영진에게 전달합니다.</li>
          <li>한숨, 남탓, 욕설, 과도한 훈수, 선을 넘는 발언은 금지입니다.</li>
          <li>내전 지각 시 주의 1회, 주의 3회 누적 시 경고 1회로 전환합니다.</li>
          <li>내전 노쇼 시 경고 1회가 부여되며 이벤트 내전 및 멸망전 참가가 제한됩니다.</li>
          <li>부라인 없이 주라인만 작성하면 예비 인원으로 분류합니다. 특정 라인만 가능하면 운영진 태그가 필요합니다.</li>
        </ol>
      </section>

      <section className="discipline-summary-grid">
        <div className="discipline-stat"><span>활성 주의</span><strong>{activeCautions}회</strong></div>
        <div className="discipline-stat"><span>활성 경고</span><strong>{activeWarnings}회</strong></div>
        <div className="discipline-stat"><span>사이트 미등록 활성 기록</span><strong>{directActiveCount}건</strong></div>
        <div className="discipline-stat"><span>주의→경고 기준</span><strong>3회</strong></div>
      </section>

      <section className="admin-card discipline-form-card">
        <h2>주의/경고 추가</h2>
        <p className="admin-muted discipline-help">대상이 사이트에 가입되어 있지 않아도 직접 입력으로 주의/경고를 남길 수 있습니다.</p>
        <div className="discipline-mode-row">
          <button type="button" className={`admin-button ${targetMode === "REGISTERED" ? "" : "admin-button--secondary"}`} onClick={() => setTargetMode("REGISTERED")}>등록 유저 선택</button>
          <button type="button" className={`admin-button ${targetMode === "DIRECT" ? "" : "admin-button--secondary"}`} onClick={() => setTargetMode("DIRECT")}>사이트 미등록 직접 입력</button>
        </div>
        <div className="discipline-form-grid">
          {targetMode === "REGISTERED" ? (
            <>
              <label>대상 검색<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="아이디, 이름, 닉네임 검색" /></label>
              <label>대상<select value={targetKey} onChange={(e) => setTargetKey(e.target.value)}>{filteredTargets.length === 0 ? <option value="">검색 결과 없음</option> : filteredTargets.map((target) => <option key={`${target.userAccountId || ""}:${target.playerId || ""}`} value={`${target.userAccountId || ""}:${target.playerId || ""}`}>{target.label}</option>)}</select></label>
            </>
          ) : (
            <>
              <label>이름<input value={directName} onChange={(e) => setDirectName(e.target.value)} placeholder="예: 정민" /></label>
              <label>닉네임<input value={directNickname} onChange={(e) => setDirectNickname(e.target.value)} placeholder="예: 원죄" /></label>
              <label>태그<input value={directTag} onChange={(e) => setDirectTag(e.target.value)} placeholder="예: KR1 / 미입력 가능" /></label>
              <div className="discipline-direct-note">사이트 계정·플레이어가 없어도 이름 기준으로 별도 기록됩니다. 이후 가입하면 검색으로 확인 후 수동 정리하면 됩니다.</div>
            </>
          )}
          <label>종류<select value={type} onChange={(e) => setType(e.target.value)}><option value="CAUTION">주의</option><option value="WARNING">경고</option></select></label>
          <label>사유 유형<select value={source} onChange={(e) => setSource(e.target.value)}><option value="MANUAL">운영자 수동</option><option value="LATE">내전 지각</option><option value="NO_SHOW">내전 노쇼</option><option value="CHAT_ABUSE">전챗/감정표현</option><option value="TOXICITY">욕설/남탓/훈수</option><option value="LINE_FORM">라인 기재 문제</option><option value="OTHER">기타</option></select></label>
          <label className="discipline-wide">사유<textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="예: 내전 시작 10분 전 미입장 / 노쇼 / 전챗 조롱" /></label>
          <label className="discipline-wide">메모<textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="운영진 내부 참고 메모" /></label>
        </div>
        <button className="admin-button" disabled={busy} onClick={() => void submit()}>{busy ? "저장 중" : "기록 추가"}</button>
      </section>

      <section className="admin-card discipline-table-card">
        <div className="admin-section-head"><h2>주의/경고 기록</h2><button className="admin-button admin-button--secondary" onClick={() => void reload()}>새로고침</button></div>
        <div className="admin-table-wrap discipline-table-wrap">
          <table className="admin-table discipline-table">
            <thead><tr><th>상태</th><th>대상</th><th>종류</th><th>사유</th><th>작성</th><th>초기화</th><th>관리</th></tr></thead>
            <tbody>
              {records.length === 0 ? <tr><td colSpan={7}>기록이 없습니다.</td></tr> : records.map((record) => {
                const target = recordTargetLabel(record);
                const isDirect = !record.userAccountId && !record.playerId;
                return (
                  <tr key={record.id}>
                    <td><span className={`discipline-pill ${record.isActive ? "active" : "reset"}`}>{record.isActive ? "활성" : "초기화"}</span></td>
                    <td><strong>{target.name}</strong>{isDirect ? <span className="discipline-direct-badge">미등록</span> : null}<br /><span className="admin-muted">{target.sub}</span></td>
                    <td><span className={`discipline-type ${record.type.toLowerCase()}`}>{typeLabel(record.type)}</span><br /><span className="admin-muted">{sourceLabel(record.source)}</span></td>
                    <td className="discipline-reason">{record.reason}{record.note ? <><br /><span className="admin-muted">{record.note}</span></> : null}</td>
                    <td>{formatDate(record.createdAt)}<br /><span className="admin-muted">{record.createdBy || "-"}</span></td>
                    <td>{record.resetAt ? formatDate(record.resetAt) : "-"}<br /><span className="admin-muted">{record.resetReason || ""}</span></td>
                    <td><div className="discipline-actions">{record.isActive ? <button className="admin-button admin-button--secondary" onClick={() => void resetRecord(record.id)}>기록 초기화</button> : null}{record.userAccountId ? <button className="admin-button admin-button--secondary" onClick={() => void resetUser(record.userAccountId)}>유저 전체 초기화</button> : null}{record.isActive && isDirect ? <button className="admin-button admin-button--secondary" onClick={() => void resetDirectTarget(record)}>직접대상 전체 초기화</button> : null}</div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
