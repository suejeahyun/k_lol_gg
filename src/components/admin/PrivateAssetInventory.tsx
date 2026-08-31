"use client";

import { useCallback, useEffect, useState } from "react";

type InventoryItem = {
  purpose: string;
  mimeType: string;
  byteSize: number;
  lifecycle: "ACTIVE" | "EXPIRED" | "UNAVAILABLE";
  expiresAt: string | null;
  createdAt: string;
  relationCount: number;
};

type InventoryState =
  | { kind: "LOADING" }
  | { kind: "READY"; items: InventoryItem[] }
  | { kind: "ERROR" };

const lifecycleLabels = {
  ACTIVE: { icon: "●", text: "보관 중" },
  EXPIRED: { icon: "◷", text: "보관 만료" },
  UNAVAILABLE: { icon: "—", text: "사용 불가" },
};

export default function PrivateAssetInventory() {
  const [state, setState] = useState<InventoryState>({ kind: "LOADING" });
  const readInventory = useCallback(async (): Promise<InventoryState> => {
    try {
      const response = await fetch("/api/admin/private-assets", { cache: "no-store" });
      const body = await response.json().catch(() => ({})) as { items?: InventoryItem[] };
      return response.ok && Array.isArray(body.items)
        ? { kind: "READY", items: body.items }
        : { kind: "ERROR" };
    } catch {
      return { kind: "ERROR" };
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void readInventory().then((nextState) => {
      if (!cancelled) setState(nextState);
    });
    return () => {
      cancelled = true;
    };
  }, [readInventory]);

  async function retry() {
    setState({ kind: "LOADING" });
    setState(await readInventory());
  }

  return (
    <main className="admin-page" tabIndex={-1} aria-busy={state.kind === "LOADING"}>
      <div className="admin-page-header">
        <div>
          <span className="admin-page-eyebrow">PRIVATE ASSET LIFECYCLE</span>
          <h1>비공개 증빙 보관 현황</h1>
          <p>최근 100건의 보관 상태와 연결 상태만 표시하며 원본 경로나 내부 식별자는 노출하지 않습니다.</p>
        </div>
      </div>
      <section className="admin-section-card" aria-live="polite">
        {state.kind === "LOADING" ? <p role="status">보관 현황을 불러오는 중입니다.</p> : null}
        {state.kind === "ERROR" ? (
          <div role="alert">
            <p>보관 현황을 불러오지 못했습니다.</p>
            <button className="admin-button" type="button" onClick={() => void retry()}>다시 시도</button>
          </div>
        ) : null}
        {state.kind === "READY" && state.items.length === 0 ? <p>표시할 증빙이 없습니다.</p> : null}
        {state.kind === "READY" && state.items.length > 0 ? (
          <div className="admin-table-wrap">
            <table>
              <thead><tr><th>용도</th><th>상태</th><th>형식</th><th>연결</th><th>생성일</th></tr></thead>
              <tbody>
                {state.items.map((item, index) => {
                  const status = lifecycleLabels[item.lifecycle];
                  return (
                    <tr key={`${item.createdAt}-${item.purpose}-${index}`}>
                      <td>{item.purpose}</td>
                      <td><span className="admin-badge"><span aria-hidden="true">{status.icon}</span> {status.text}</span></td>
                      <td>{item.mimeType}</td>
                      <td>{item.relationCount}건</td>
                      <td>{new Date(item.createdAt).toLocaleDateString("ko-KR")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </main>
  );
}
