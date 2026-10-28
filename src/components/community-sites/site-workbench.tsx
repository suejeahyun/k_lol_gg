"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { SiteConfigurationEditor } from "./site-configuration-editor";
import { createDefaultCommunitySiteConfig, validateCommunitySiteConfig, type CommunitySiteConfig } from "@/modules/community-sites/domain/site-configuration";
import type { CommunitySite, CommunitySiteStatus } from "@/modules/community-sites/domain/community-site";
import styles from "./site-workbench.module.css";

const statusLabels: Record<CommunitySiteStatus, string> = {
  SUBMITTED: "심사 대기", CHANGES_REQUESTED: "보완 요청", REJECTED: "반려", CANCELLED: "신청 취소",
  APPROVED: "개설 대기", PROVISIONING: "개설 중", AWAITING_OWNER: "소유자 확인 대기", ACTIVATING: "공개 처리·상태 확인 중", ACTIVE: "운영 중", FAILED: "개설 확인 필요",
};
const editableStates: CommunitySiteStatus[] = ["SUBMITTED", "CHANGES_REQUESTED", "REJECTED", "CANCELLED", "ACTIVE"];
const time = (value: string) => new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" }).format(new Date(value));

export function SiteWorkbench({ mode, siteId }: { mode: "list" | "create" | "owner" | "review"; siteId?: string }) {
  const admin = mode === "review";
  const api = admin ? "/api/admin/community-sites" : "/api/community-sites";
  const [sites, setSites] = useState<CommunitySite[]>([]);
  const [selectedId, setSelectedId] = useState(siteId ?? "");
  const [configuration, setConfiguration] = useState<CommunitySiteConfig>(() => createDefaultCommunitySiteConfig());
  const [loaded, setLoaded] = useState(mode === "create");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [reason, setReason] = useState("");
  const [provisioningReady, setProvisioningReady] = useState(false);
  const pending = useRef<{ signature: string; key: string } | null>(null);
  const site = sites.find((item) => item.id === selectedId);
  const isNew = mode === "create" && !site;
  const jobBusy = site?.latestJob?.status === "PENDING" || site?.latestJob?.status === "RUNNING";

  const load = useCallback(async () => {
    const response = await fetch(siteId ? `${api}/${siteId}` : api, { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) throw new Error("LOAD_FAILED");
    const result = await response.json() as { sites?: CommunitySite[]; site?: CommunitySite; provisioningReady?: boolean };
    return { items: result.site ? [result.site] : result.sites ?? [], provisioningReady: result.provisioningReady === true };
  }, [api, siteId]);

  useEffect(() => {
    if (mode === "create") return;
    let disposed = false;
    load().then(({ items, provisioningReady }) => {
      if (disposed) return;
      setProvisioningReady(provisioningReady);
      setSites(items); setLoaded(true);
      const selected = siteId ? items.find((item) => item.id === siteId) : admin ? items[0] : undefined;
      if (selected) { setSelectedId(selected.id); setConfiguration(selected.configuration); }
    }).catch(() => {
      if (!disposed) { setError(true); setMessage("목록을 불러오지 못했습니다. 로그인 상태를 확인하고 다시 시도해 주세요."); setLoaded(true); }
    });
    return () => { disposed = true; };
  }, [mode, load, siteId, admin]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    if (!jobBusy || busy) return;
    let disposed = false;
    let refreshing = false;
    const timer = window.setInterval(() => {
      if (refreshing) return;
      refreshing = true;
      load().then(({ items, provisioningReady }) => {
        if (disposed) return;
        setSites(items); setProvisioningReady(provisioningReady);
        const current = items.find((item) => item.id === selectedId);
        if (current && !dirty) setConfiguration(current.configuration);
      }).catch(() => { /* The manual refresh remains available if a background refresh fails. */ }).finally(() => { refreshing = false; });
    }, 15_000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [jobBusy, busy, load, selectedId, dirty]);

  function edit(next: CommunitySiteConfig) { setConfiguration(next); setDirty(true); setMessage(""); setError(false); }
  function select(item: CommunitySite) {
    if (dirty && !window.confirm("저장하지 않은 편집 내용을 버리고 이동할까요?")) return;
    setSelectedId(item.id); setConfiguration(item.configuration); setDirty(false); setReason(""); setMessage(""); setError(false);
  }
  async function reload() {
    if (dirty && !window.confirm("저장하지 않은 편집 내용을 버리고 최신 정보를 불러올까요?")) return;
    setBusy(true);
    try {
      const result = await load(); const items = result.items;
      setProvisioningReady(result.provisioningReady); setSites(items); setLoaded(true);
      const current = items.find((item) => item.id === selectedId) ?? (admin ? items[0] : undefined);
      if (current) { setSelectedId(current.id); setConfiguration(current.configuration); }
      setDirty(false); setError(false); setMessage("최신 상태를 불러왔습니다."); pending.current = null;
    } catch { setError(true); setMessage("불러오지 못했습니다. 현재 편집 내용은 유지됩니다."); }
    finally { setBusy(false); }
  }
  async function command(action: string) {
    if (busy) return;
    let body: Record<string, unknown>;
    try {
      body = admin ? { action, reason } : action === "update" || (action === "submit" && isNew)
        ? { action, configuration: validateCommunitySiteConfig(configuration) } : { action };
    } catch { setError(true); setMessage("이름·주소·이미지·기능 설정의 안내를 확인해 주세요."); return; }
    const target = isNew ? api : `${api}/${site!.id}`;
    const revision = site?.revision ?? 0;
    const signature = JSON.stringify({ target, revision, body });
    if (pending.current?.signature !== signature) pending.current = { signature, key: crypto.randomUUID() };
    setBusy(true); setError(false); setMessage("");
    try {
      const response = await fetch(target, { method: isNew ? "POST" : "PATCH", credentials: "same-origin", headers: {
        "Content-Type": "application/json", "Idempotency-Key": pending.current.key, "If-Match": `"${revision}"`,
      }, body: JSON.stringify(body) });
      const result = await response.json() as { site?: CommunitySite; detail?: string };
      if (!response.ok || !result.site) {
        setError(true); setMessage(response.status === 412 ? "다른 변경이 먼저 저장됐습니다. 현재 편집 내용을 확인한 뒤 최신 상태를 불러와 주세요." : result.detail ?? "요청을 처리하지 못했습니다.");
        if (response.status < 500) pending.current = null;
        return;
      }
      const saved = result.site;
      setSites((items) => items.some((item) => item.id === saved.id) ? items.map((item) => item.id === saved.id ? saved : item) : [saved, ...items]);
      setSelectedId(saved.id); setConfiguration(saved.configuration); setDirty(false); pending.current = null;
      setMessage(action === "activate" ? "공개 처리를 요청했습니다. 완료되면 운영 중으로 표시됩니다." : action === "approve" ? "승인했습니다. 개설 작업의 진행 상태를 확인해 주세요." : action === "publish" ? "게시를 요청했습니다. 사이트 적용이 끝나면 상태가 갱신됩니다." : action === "update" ? "초안을 저장했습니다. 운영 사이트에는 게시 후 적용됩니다." : "요청을 저장했습니다.");
    } catch { setError(true); setMessage("처리 결과를 확인하지 못했습니다. 같은 내용으로 다시 시도하면 중복 요청을 방지합니다."); }
    finally { setBusy(false); }
  }

  return <main className={styles.page} aria-busy={busy}>
    <header className={styles.header}><div><p>GG HUB · COMMUNITY STUDIO</p><h1>{admin ? "사이트 개설 심사" : isNew ? "우리 커뮤니티 만들기" : mode === "list" ? "내가 운영하는 사이트" : "사이트 꾸미기와 기능 관리"}</h1>
      <span>{admin ? "신청 내용을 검토하고 개설 작업의 상태를 확인하세요." : "테마와 기능을 고르고, 우리 커뮤니티에 맞게 운영하세요."}</span></div>
      <div className={styles.actions}><Link href="/sites">내 사이트</Link>{mode !== "create" && !admin ? <Link href="/sites/new">새 사이트 신청</Link> : null}{!isNew ? <Button variant="outline" onClick={reload} disabled={busy}>상태 새로고침</Button> : null}</div></header>
    {message ? <p className={error ? styles.error : styles.message} role={error ? "alert" : "status"}>{message}</p> : null}
    {!loaded ? <p role="status">신청 정보를 불러오는 중입니다…</p> : null}
    {mode === "list" && loaded ? <section className={styles.cards} aria-label="내 사이트 목록">
      {sites.length === 0 && !error ? <div className={styles.empty}><h2>첫 커뮤니티를 시작해 보세요</h2><p>세 가지 테마와 사용할 기능을 선택해 개설을 신청할 수 있습니다.</p><Link href="/sites/new">사이트 만들기 →</Link></div> : sites.map((item) => <article className={styles.card} key={item.id}><span className={styles.badge}>{statusLabels[item.status]}</span><h2>{item.configuration.name}</h2><p>{item.configuration.description}</p><small>최근 변경 {time(item.updatedAt)}</small><Link href={`/sites/${item.id}`}>설정과 진행 상태 →</Link>{item.origin ? <a href={item.origin} target="_blank" rel="noopener noreferrer">사이트 방문 ↗</a> : null}</article>)}
    </section> : null}
    {admin && loaded ? <nav className={styles.tabs} aria-label="심사할 사이트">{sites.length === 0 && !error ? <p>접수된 신청이 없습니다.</p> : sites.map((item) => <button type="button" key={item.id} onClick={() => select(item)} disabled={busy} aria-pressed={selectedId === item.id}><strong>{item.configuration.name}</strong><span>{statusLabels[item.status]}</span></button>)}</nav> : null}
    {(isNew || site) && mode !== "list" ? <>
      {site ? <section className={styles.progress} aria-label="개설 진행 상태"><div><span className={styles.badge}>{statusLabels[site.status]}</span><span>최근 변경 {time(site.updatedAt)}</span></div>
        {site.reviewReason ? <p><strong>심사 안내</strong> {site.reviewReason}</p> : null}
        {site.latestJob ? <p>최근 작업: {site.latestJob.kind === "PROVISION" ? "사이트 개설" : site.latestJob.kind === "ACTIVATE_SITE" ? "사이트 공개" : "설정 게시"} · {({ PENDING: "대기", RUNNING: "진행 중", SUCCEEDED: "완료", FAILED: "확인 필요" })[site.latestJob.status]}{site.latestJob.status === "FAILED" ? " — 운영자가 작업 상태를 확인한 뒤 재개할 수 있습니다." : ""}</p> : null}
        {site.status === "ACTIVATING" ? <p role="status">공개 요청을 처리하고 실제 사이트 상태를 확인하고 있습니다. 일부 처리가 먼저 적용될 수 있으며, 확인이 늦어지면 자동으로 다시 확인합니다.{site.latestJob?.errorCode ? " 현재 응답 확인이 지연되고 있습니다." : ""}</p> : null}
        {site.origin ? <a href={site.origin} target="_blank" rel="noopener noreferrer">{site.origin} ↗</a> : <p>사이트 주소는 승인 후 실제 발급되면 표시됩니다.</p>}
        {site.status === "AWAITING_OWNER" && !admin ? <><p>사이트의 화면과 운영진 로그인을 확인하고 운영을 시작해 주세요.</p><Button onClick={() => command("activate")} disabled={busy || jobBusy}>{jobBusy && site.latestJob?.kind === "ACTIVATE_SITE" ? "공개 처리 중" : "확인 완료 · 운영 시작"}</Button></> : null}
      </section> : null}
      <div className={styles.workspace}><section><SiteConfigurationEditor configuration={configuration} onChange={edit} disabled={busy || admin || (!!site && !editableStates.includes(site.status))} lockSlug={!!site && ["ACTIVE", "AWAITING_OWNER", "ACTIVATING"].includes(site.status)} />
        {!admin ? <div className={styles.savebar}>
          {isNew ? <><p>신청 후 GG HUB 운영자가 검토합니다. 기존 커뮤니티의 회원·경기 자료는 복사하지 않습니다.</p><Button onClick={() => command("submit")} disabled={busy}>개설 신청하기</Button></> : site && editableStates.includes(site.status) ? <>
            <Button onClick={() => command("update")} disabled={busy || !dirty}>초안 저장</Button>
            {site.status === "ACTIVE" ? <Button onClick={() => command("publish")} disabled={busy || dirty || jobBusy}>저장한 설정 게시</Button> : ["CHANGES_REQUESTED", "REJECTED", "CANCELLED"].includes(site.status) ? <Button onClick={() => command("submit")} disabled={busy || dirty}>다시 심사 요청</Button> : null}
            {site.publishedConfiguration ? <Button variant="outline" disabled={busy} onClick={() => edit(site.publishedConfiguration!)}>현재 게시본을 초안으로 복원</Button> : null}
            {site.status === "SUBMITTED" || site.status === "CHANGES_REQUESTED" ? <Button variant="outline" disabled={busy || dirty} onClick={() => { if (window.confirm("이 사이트의 개설 신청을 취소할까요?")) void command("cancel"); }}>신청 취소</Button> : null}
            <p>{dirty ? "저장하지 않은 변경이 있습니다." : site.status === "ACTIVE" ? "초안 저장 후 게시하면 사이트에 적용됩니다. 기능을 꺼도 기존 기록은 유지됩니다." : "승인된 설정은 개설이 끝날 때까지 변경할 수 없습니다."}</p>
          </> : null}
        </div> : site && ["SUBMITTED", "FAILED"].includes(site.status) ? <section className={styles.review}><h2>심사 결과</h2><label htmlFor="review-reason">신청자에게 보낼 안내</label><textarea id="review-reason" rows={3} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} disabled={busy} /><p>{provisioningReady ? "승인하면 개설 작업이 등록됩니다. 실제 진행 상태는 개설 후 확인할 수 있습니다." : "자동 개설 연결을 준비하고 있습니다. 신청 검토와 보완 요청은 가능하며, 연결이 완료되면 승인할 수 있습니다."}</p><div className={styles.actions}><Button disabled={busy || !provisioningReady} onClick={() => command("approve")}>{site.status === "FAILED" ? "기존 개설 작업 재개" : "개설 승인"}</Button>{site.status === "SUBMITTED" ? <><Button variant="outline" disabled={busy || !reason.trim()} onClick={() => command("request_changes")}>보완 요청</Button><Button variant="outline" disabled={busy || !reason.trim()} onClick={() => command("reject")}>반려</Button></> : null}</div></section> : site?.status === "CHANGES_REQUESTED" ? <p className={styles.message}>신청자의 보완과 재제출을 기다리고 있습니다.</p> : null}
      </section></div>
    </> : null}
  </main>;
}
