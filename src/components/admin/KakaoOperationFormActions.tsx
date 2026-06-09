"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  kakaoOperationFormStatusLabels,
  kakaoOperationFormStatuses,
  type KakaoOperationFormType,
} from "@/lib/kakao/operation-forms";

type Props = {
  formType: KakaoOperationFormType;
  id: number;
  status: string;
  memo?: string | null;
};

export default function KakaoOperationFormActions({ formType, id, status, memo }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function updateStatus(nextStatus: string) {
    setPending(true);
    try {
      const response = await fetch(`/api/admin/operation-forms/${formType}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        alert(data.message || "상태 변경에 실패했습니다.");
        return;
      }

      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function updateMemo() {
    const nextMemo = window.prompt("운영자 메모를 입력하세요.", memo || "");
    if (nextMemo === null) return;

    setPending(true);
    try {
      const response = await fetch(`/api/admin/operation-forms/${formType}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memo: nextMemo }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        alert(data.message || "메모 저장에 실패했습니다.");
        return;
      }

      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function deleteItem() {
    if (!window.confirm(`#${id} 항목을 삭제하시겠습니까?`)) return;

    setPending(true);
    try {
      const response = await fetch(`/api/admin/operation-forms/${formType}/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        alert(data.message || "삭제에 실패했습니다.");
        return;
      }

      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 8, minWidth: 140 }}>
      <select
        className="admin-input"
        value={status}
        disabled={pending}
        onChange={(event) => updateStatus(event.target.value)}
        aria-label="처리 상태"
      >
        {kakaoOperationFormStatuses.map((item) => (
          <option key={item} value={item}>
            {kakaoOperationFormStatusLabels[item] || item}
          </option>
        ))}
      </select>
      <button className="admin-button admin-button--secondary" type="button" disabled={pending} onClick={updateMemo}>
        메모 수정
      </button>
      <button className="admin-button admin-button--danger" type="button" disabled={pending} onClick={deleteItem}>
        삭제
      </button>
    </div>
  );
}
