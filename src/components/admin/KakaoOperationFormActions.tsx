"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { KakaoOperationFormType } from "@/lib/kakao/operation-forms";

type Props = {
  formType: KakaoOperationFormType;
  id: number;
};

export default function KakaoOperationFormActions({ formType, id }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function deleteItem() {
    if (!window.confirm(`#${id} 항목을 목록에서 숨기겠습니까? DB 기록은 보존됩니다.`)) return;

    setPending(true);
    try {
      const response = await fetch(`/api/admin/operation-forms/${formType}/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        alert(data.message || "삭제 처리에 실패했습니다.");
        return;
      }

      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, width: "100%", minWidth: 0 }}>
      <Link
        className="admin-button admin-button--secondary"
        href={`/admin/operation-forms/${formType}/${id}`}
        style={{ whiteSpace: "nowrap", padding: "7px 6px", fontSize: "0.76rem", lineHeight: 1.1, minWidth: 0, width: "100%", textAlign: "center" }}
      >
        상세
      </Link>
      <button
        className="admin-button admin-button--danger"
        type="button"
        disabled={pending}
        onClick={deleteItem}
        style={{ whiteSpace: "nowrap", padding: "7px 6px", fontSize: "0.76rem", lineHeight: 1.1, minWidth: 0, width: "100%", textAlign: "center" }}
      >
        삭제
      </button>
    </div>
  );
}
