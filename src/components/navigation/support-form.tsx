"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { SUPPORT_CATEGORIES } from "@/modules/recruiting/operation-forms/site-support";
import { recordUsageAction } from "@/components/usage/usage-actions";
import { useUnsavedChanges } from "@/components/forms/use-unsaved-changes";

export function SupportForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState("");
  const [dirty, setDirty] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const sending = useRef(false);
  const ticket = useRef<{ body: string; key: string } | null>(null);
  const receiptRef = useRef<HTMLDivElement>(null);
  useUnsavedChanges(dirty && !receipt);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current || receipt) return;
    const data = new FormData(event.currentTarget);
    const body = uncertain && ticket.current ? ticket.current.body : JSON.stringify({ nickname: data.get("nickname"), replyTo: data.get("replyTo"), category: data.get("category"), content: data.get("content"), consent: data.get("consent") === "on" });
    if (ticket.current?.body !== body) ticket.current = { body, key: `support-${crypto.randomUUID()}` };
    sending.current = true;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/support", { method: "POST", credentials: "same-origin", signal: AbortSignal.timeout(20_000), headers: { "Content-Type": "application/json", "Idempotency-Key": ticket.current.key }, body });
      if (response.status >= 400 && response.status < 500) {
        const result = await response.json().catch(() => null) as { detail?: string } | null;
        setUncertain(false);
        if (response.status === 409) ticket.current = null;
        setError(result?.detail ?? "문의 입력과 접속 상태를 확인한 뒤 다시 보내 주세요.");
        return;
      }
      const result = await response.json() as { receiptId?: string; detail?: string };
      if (!response.ok || typeof result.receiptId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(result.receiptId)) throw new Error("SUPPORT_RESULT_UNCERTAIN");
      setReceipt(result.receiptId);
      setUncertain(false); setDirty(false);
      recordUsageAction("support.submitted");
      requestAnimationFrame(() => receiptRef.current?.focus());
    } catch { setUncertain(true); setError("접수 여부를 확인하지 못했어요. 아래 버튼으로 원래 요청의 결과를 다시 확인해 주세요. 결과가 확인될 때까지 내용을 보관합니다."); }
    finally { sending.current = false; setBusy(false); }
  }
  if (receipt) return <div ref={receiptRef} tabIndex={-1} className="task-section" role="status"><h2>운영팀에 문의를 접수했어요.</h2><p>접수번호: <code>{receipt}</code></p><p>입력한 연락 방법으로 답변합니다. 실시간 상담은 아닙니다.</p><Link href="/">홈으로 돌아가기</Link></div>;
  return <form className="support-form" onSubmit={submit} onChange={() => setDirty(true)} aria-label="운영팀 문의 접수" aria-busy={busy}>
    <fieldset disabled={busy || uncertain}>
    <legend className="sr-only">문의 내용</legend>
    <label>닉네임<input name="nickname" required maxLength={100} autoComplete="nickname" placeholder="실명 대신 사용하는 닉네임" /></label>
    <label>답변 받을 연락 방법<input name="replyTo" required maxLength={64} autoComplete="off" placeholder="이메일 또는 운영팀과 함께 있는 채팅방·닉네임" /><small>운영팀이 직접 답변합니다. 자동 메일은 발송되지 않습니다.</small></label>
    <label>문의 종류<select name="category" required>{SUPPORT_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label>
    <label>문의 내용<textarea name="content" required minLength={1} maxLength={4000} rows={7} placeholder="어느 화면에서 무엇을 하려 했는지, 어떤 도움이 필요한지 적어 주세요." /></label>
    <p>비밀번호, 인증 코드, 주민등록번호는 적지 마세요. 개인정보 요청은 대상 닉네임과 요청 범위만 먼저 알려 주세요.</p>
    <label className="support-consent"><input type="checkbox" name="consent" required /><span>문의 처리와 답변을 위해 닉네임, 연락 방법, 문의 내용을 수집·이용하는 데 동의합니다. 새 사이트 문의는 접수 후 최대 180일을 기준으로 정리합니다. 동의하지 않으면 접수할 수 없습니다. <Link href="/privacy">개인정보 처리 안내</Link></span></label>
    </fieldset>
    {error ? <p role="alert">{error}</p> : null}
    <button type="submit" disabled={busy}>{busy ? "접수 확인 중…" : uncertain ? "원래 문의의 접수 결과 확인" : error ? "문의 다시 보내기" : "운영팀에 문의 보내기"}</button>
  </form>;
}
