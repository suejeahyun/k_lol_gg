"use client";

import { FormEvent, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { recordUsageAction } from "@/components/usage/usage-actions";
import { useRouter } from "next/navigation";

import { competitionPositionLabel } from "@/modules/competitions/core/display-projection";
import styles from "../../events.module.css";

type Application = Readonly<{ participantId: string; mainPosition: string | null; subPositions: readonly string[]; status: "ACTIVE" | "CANCELLED" }> | null;
const positions = ["TOP", "JGL", "MID", "ADC", "SUP"] as const;

export function EventApplicationActions({ eventId, revision, format, open, signedIn, approved, application, focusOnMount = false }: { eventId: string; revision: number; format: "POSITION" | "ARAM"; open: boolean; signedIn: boolean; approved: boolean; application: Application; focusOnMount?: boolean }) {
  const router = useRouter();
  const regionRef = useRef<HTMLElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const newParticipantId = useRef<string | null>(null);
  const pendingRequest = useRef<{ fingerprint: string; key: string } | null>(null);

  useLayoutEffect(() => {
    if (!focusOnMount) return;
    const target = regionRef.current;
    if (!target) return;
    const targetTop = target.getBoundingClientRect().top;
    if (targetTop < 0 || targetTop > window.innerHeight * 0.75) target.scrollIntoView({ block: "start" });
    target.focus({ preventScroll: true });
  }, [focusOnMount]);

  async function mutate(method: "PUT" | "DELETE", body: unknown) {
    setBusy(true); setMessage("");
    const fingerprint = JSON.stringify({ method, body, revision });
    if (pendingRequest.current?.fingerprint !== fingerprint) pendingRequest.current = { fingerprint, key: `event-application-${crypto.randomUUID()}` };
    try {
      const response = await fetch(`/api/competitions/events/${eventId}/application`, { method, headers: { "Content-Type": "application/json", "If-Match": `"${revision}"`, "Idempotency-Key": pendingRequest.current.key }, body: JSON.stringify(body) });
      const result = await response.json() as { detail?: string };
      if (response.status === 412) { pendingRequest.current = null; router.refresh(); throw new Error("참가 현황이 변경되어 최신 내용을 불러왔어요. 다시 신청해 주세요."); }
      if (!response.ok) throw new Error(result.detail ?? "신청을 처리하지 못했습니다.");
      pendingRequest.current = null;
      if (method === "PUT") recordUsageAction("event.applied");
      setMessage(method === "DELETE" ? "신청을 취소했습니다." : "참가 신청을 저장했습니다.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "신청을 처리하지 못했습니다."); }
    finally { setBusy(false); }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    newParticipantId.current ??= crypto.randomUUID();
    const mainPosition = format === "ARAM" ? null : data.get("mainPosition");
    void mutate("PUT", { participantId: application?.participantId ?? newParticipantId.current, mainPosition, subPositions: format === "ARAM" ? [] : data.getAll("subPositions").filter((position) => position !== mainPosition) });
  }

  const region = (children: React.ReactNode) => <section ref={regionRef} id="event-application" tabIndex={-1} className={styles.applicationDeepLink} aria-labelledby="event-application-title"><h2 id="event-application-title">참가 신청</h2>{children}</section>;
  if (!signedIn) return region(<p className={styles.applicationNotice}>로그인·승인 계정 필요 <Link href={`/login?next=${encodeURIComponent(`/competitions/events/${eventId}?action=apply`)}`}>로그인하고 신청하기</Link></p>);
  if (!approved) return region(<p className={styles.applicationNotice}>계정 승인·활성 플레이어 연결 필요 <Link href="/account">내 계정 상태 확인</Link></p>);
  if (!open) return region(<p className={styles.applicationNotice}>참가 신청 기간 아님 <Link href="/applications?type=event">다른 이벤트 모집 보기</Link></p>);
  return region(<form className={styles.application} onSubmit={submit}>
    {format === "POSITION" ? <><label>주 포지션<select name="mainPosition" defaultValue={application?.mainPosition ?? "TOP"}>{positions.map((position) => <option key={position} value={position}>{competitionPositionLabel(position)}</option>)}</select></label><fieldset><legend>부 포지션</legend>{positions.map((position) => <label key={position}><input type="checkbox" name="subPositions" value={position} defaultChecked={application?.subPositions.includes(position)} /> {competitionPositionLabel(position)}</label>)}</fieldset></> : <p>칼바람 · 포지션 구분 없음</p>}
    <div><button disabled={busy} type="submit">{application?.status === "ACTIVE" ? "신청 수정" : "신청하기"}</button>{application?.status === "ACTIVE" ? <button disabled={busy} type="button" className={styles.secondary} onClick={() => mutate("DELETE", {})}>신청 취소</button> : null}</div>
    <p role="status" aria-live="polite">{busy ? "처리 중…" : message}</p>
  </form>);
}
