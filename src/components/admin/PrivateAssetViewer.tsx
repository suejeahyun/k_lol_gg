"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

type ViewerState =
  | { kind: "LOADING" }
  | { kind: "ACTIVE"; purpose: string; mimeType: string }
  | { kind: "EXPIRED" }
  | { kind: "NOT_FOUND" }
  | { kind: "ERROR" };

const purposeLabels: Record<string, string> = {
  INHOUSE_RESULT: "내전 결과 증빙",
  DISCIPLINE_ISSUE: "경고 접수 증빙",
  DISCIPLINE_RESOLUTION: "경고 차감 증빙",
};

export default function PrivateAssetViewer({ assetId }: { assetId: string }) {
  const [state, setState] = useState<ViewerState>({ kind: "LOADING" });
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  const readMetadata = useCallback(async (): Promise<ViewerState> => {
    try {
      const response = await fetch(`/api/admin/private-assets/${encodeURIComponent(assetId)}/metadata`, {
        cache: "no-store",
      });
      const body = await response.json().catch(() => ({})) as {
        state?: string;
        purpose?: string;
        mimeType?: string;
      };
      if (response.status === 410 || body.state === "EXPIRED") {
        return { kind: "EXPIRED" };
      } else if (response.status === 404 || response.status === 401 || response.status === 403) {
        return { kind: "NOT_FOUND" };
      } else if (response.ok && body.state === "ACTIVE" && body.purpose && body.mimeType) {
        return { kind: "ACTIVE", purpose: body.purpose, mimeType: body.mimeType };
      }
      return { kind: "ERROR" };
    } catch {
      return { kind: "ERROR" };
    }
  }, [assetId]);

  useEffect(() => {
    let cancelled = false;
    void readMetadata().then((nextState) => {
      if (!cancelled) setState(nextState);
    });
    return () => {
      cancelled = true;
    };
  }, [readMetadata]);

  useEffect(() => {
    if (state.kind !== "LOADING") headingRef.current?.focus();
  }, [state.kind]);

  const title = state.kind === "ACTIVE"
    ? purposeLabels[state.purpose] ?? "비공개 증빙"
    : "비공개 증빙 확인";

  async function retry() {
    setState({ kind: "LOADING" });
    setState(await readMetadata());
  }

  return (
    <main className="admin-page" tabIndex={-1} aria-busy={state.kind === "LOADING"}>
      <div className="admin-page-header">
        <div>
          <span className="admin-page-eyebrow">PRIVATE EVIDENCE</span>
          <h1 ref={headingRef} tabIndex={-1}>{title}</h1>
          <p>권한과 보관 상태를 먼저 확인한 뒤 원본을 표시합니다.</p>
        </div>
        <Link className="admin-button admin-button--ghost" href="/admin/private-assets">
          증빙 보관 현황
        </Link>
      </div>

      <section className="admin-section-card" aria-live="polite">
        {state.kind === "LOADING" ? <p role="status">증빙 상태를 확인하는 중입니다.</p> : null}
        {state.kind === "ACTIVE" ? (
          <>
            <p><span className="admin-badge"><span aria-hidden="true">●</span> 열람 가능</span></p>
            <Image
              src={`/api/admin/private-assets/${encodeURIComponent(assetId)}`}
              alt={`${title} 이미지`}
              width={1600}
              height={1200}
              unoptimized
              style={{ display: "block", maxWidth: "100%", height: "auto", borderRadius: 12 }}
              onError={() => setState({ kind: "ERROR" })}
            />
          </>
        ) : null}
        {state.kind === "EXPIRED" ? (
          <div role="status">
            <p><span className="admin-badge"><span aria-hidden="true">◷</span> 보관 만료</span></p>
            <p>보관 기간이 끝나 원본 이미지를 제공하지 않습니다.</p>
          </div>
        ) : null}
        {state.kind === "NOT_FOUND" ? (
          <div role="alert">
            <p><span className="admin-badge"><span aria-hidden="true">—</span> 열람 불가</span></p>
            <p>증빙을 찾을 수 없거나 현재 계정으로 열람할 수 없습니다.</p>
          </div>
        ) : null}
        {state.kind === "ERROR" ? (
          <div role="alert">
            <p><span className="admin-badge"><span aria-hidden="true">!</span> 일시 오류</span></p>
            <p>증빙을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>
            <button className="admin-button" type="button" onClick={() => void retry()}>
              다시 시도
            </button>
          </div>
        ) : null}
      </section>
    </main>
  );
}
