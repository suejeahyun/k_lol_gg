"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { KakaoOperationFormType } from "@/lib/kakao/operation-forms";

type Props = {
  formType: KakaoOperationFormType;
  id: number;
  memo?: string | null;
};

export default function KakaoOperationFormActions({ formType, id, memo }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

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
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", minWidth: 150 }}>
      <button className="admin-button admin-button--secondary" type="button" disabled={pending} onClick={updateMemo}>
        메모수정
      </button>
      <button className="admin-button admin-button--danger" type="button" disabled={pending} onClick={deleteItem}>
        삭제
      </button>
    </div>
  );
}
