"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  kakaoOperationFormStatusLabels,
  kakaoOperationFormStatuses,
  type KakaoOperationFormType,
} from "@/lib/kakao/operation-forms";

type DetailItem = {
  id: number;
  type: KakaoOperationFormType;
  title: string;
  status: string;
  memo: string | null;
  rawText: string;
  roomName: string | null;
  sender: string | null;
  createdAt: string;
  updatedAt: string;
  fields: { label: string; value: string }[];
};

function formatDate(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(new Date(value));

  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  const hour24 = Number(get("hour")) % 24;
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const marker = hour24 >= 12 ? "PM" : "AM";
  return `${get("year")}. ${get("month")}. ${get("day")}. ${marker} ${String(hour12).padStart(2, "0")}:${get("minute")}`;
}

function statusLabel(status: string) {
  return kakaoOperationFormStatusLabels[status] || status || "-";
}

export default function KakaoOperationFormDetailClient({ item }: { item: DetailItem }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState(item.status);
  const [memo, setMemo] = useState(item.memo || "");

  async function save() {
    setPending(true);
    try {
      const response = await fetch(`/api/admin/operation-forms/${item.type}/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, memo }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        alert(data.message || "저장에 실패했습니다.");
        return;
      }

      alert("저장되었습니다.");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function deleteItem() {
    if (!window.confirm(`#${item.id} 항목을 목록에서 숨기겠습니까? DB 기록은 보존됩니다.`)) return;
    setPending(true);
    try {
      const response = await fetch(`/api/admin/operation-forms/${item.type}/${item.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        alert(data.message || "삭제 처리에 실패했습니다.");
        return;
      }

      router.push(`/admin/operation-forms/${item.type}`);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="admin-page" style={{ width: "min(1120px, calc(100vw - 40px))", margin: "0 auto" }}>
      <div className="admin-page__header" style={{ marginBottom: 22 }}>
        <div>
          <p className="page-eyebrow">KAKAO OPERATION DETAIL</p>
          <h1>{item.title} #{item.id}</h1>
        </div>
        <Link className="admin-button admin-button--ghost" href={`/admin/operation-forms/${item.type}`}>
          목록으로
        </Link>
      </div>

      <section className="admin-card" style={{ padding: 22, marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          <Summary label="현재 상태" value={statusLabel(item.status)} />
          <Summary label="등록 일시" value={formatDate(item.createdAt)} />
          <Summary label="수정 일시" value={formatDate(item.updatedAt)} />
          <Summary label="카카오톡 방" value={item.roomName || "-"} />
          <Summary label="보낸 사람" value={item.sender || "-"} />
        </div>
      </section>

      <section className="admin-card" style={{ padding: 22, marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>상세 정보</h2>
        <div style={{ display: "grid", gap: 12 }}>
          {item.fields.map((field) => (
            <div
              key={field.label}
              style={{
                border: "1px solid rgba(148, 163, 184, 0.16)",
                borderRadius: 14,
                padding: 14,
                background: "rgba(2, 6, 23, 0.28)",
              }}
            >
              <div className="admin-muted" style={{ fontSize: 12, marginBottom: 6 }}>{field.label}</div>
              <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6, wordBreak: "break-word" }}>{field.value || "-"}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="admin-card" style={{ padding: 22, marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>관리자 메모 / 상태</h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(180px, 260px) minmax(0, 1fr)",
            gap: 14,
            alignItems: "start",
          }}
        >
          <label style={{ display: "grid", gap: 8, fontWeight: 800 }}>
            상태
            <select
              className="app-input"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              style={{ width: "100%", minHeight: 44 }}
            >
              {kakaoOperationFormStatuses.map((value) => (
                <option key={value} value={value}>{statusLabel(value)}</option>
              ))}
            </select>
          </label>
          <label style={{ display: "grid", gap: 8, fontWeight: 800 }}>
            관리자 메모
            <textarea
              className="app-input"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              rows={7}
              placeholder="관리자만 확인하는 내부 메모"
              style={{
                width: "100%",
                minHeight: 148,
                resize: "vertical",
                lineHeight: 1.65,
                padding: "13px 14px",
                borderRadius: 14,
                background: "rgba(2, 6, 23, 0.86)",
                color: "#f8fafc",
              }}
            />
          </label>
          <div style={{ gridColumn: "1 / -1", display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button className="admin-button" type="button" disabled={pending} onClick={save}>저장</button>
            <button className="admin-button admin-button--danger" type="button" disabled={pending} onClick={deleteItem}>삭제</button>
          </div>
        </div>
      </section>

      <section className="admin-card" style={{ padding: 22 }}>
        <h2 style={{ marginTop: 0 }}>원문</h2>
        <pre style={{ whiteSpace: "pre-wrap", lineHeight: 1.7, margin: 0, wordBreak: "break-word" }}>{item.rawText}</pre>
      </section>
    </main>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: "1px solid rgba(148, 163, 184, 0.16)", borderRadius: 14, padding: 14, background: "rgba(2, 6, 23, 0.28)", minWidth: 0 }}>
      <div className="admin-muted" style={{ fontSize: 12, marginBottom: 6 }}>{label}</div>
      <div style={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={value}>{value}</div>
    </div>
  );
}
