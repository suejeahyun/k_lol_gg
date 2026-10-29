"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IntroductionContent } from "@/components/community-introduction/introduction-content";
import { CommunityIntroductionValidationError, validateCommunityIntroduction, type CommunityIntroduction, type CommunityIntroductionSnapshot } from "@/modules/operations/domain/community-introduction";
import styles from "./introduction-editor.module.css";

const textFields = [
  { key: "summary", label: "한 줄 소개", maximum: 160, rows: 2, hint: "어떤 커뮤니티인지 짧게 알려 주세요." },
  { key: "introduction", label: "상세 소개", maximum: 3000, rows: 9, hint: "커뮤니티의 분위기와 운영 방식을 자유롭게 소개해 주세요." },
  { key: "activities", label: "함께하는 활동", maximum: 600, rows: 4, hint: "즐기는 게임, 내전이나 친목 활동 등을 알려 주세요." },
  { key: "activityHours", label: "주로 활동하는 시간", maximum: 160, rows: 2, hint: "예: 평일 저녁 8시 이후, 주말 자유 참여" },
  { key: "joiningInfo", label: "가입·참여 안내", maximum: 1000, rows: 5, hint: "참여 조건과 가입 절차, 처음 온 분이 확인할 내용을 적어 주세요." },
] as const;

export function CommunityIntroductionForm({ initial, communityName }: { initial: CommunityIntroductionSnapshot; communityName: string }) {
  const [saved, setSaved] = useState(initial);
  const [profile, setProfile] = useState<CommunityIntroduction>(initial.profile);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [invalidField, setInvalidField] = useState<string | null>(null);
  const pending = useRef<{ payload: string; revision: number; key: string } | null>(null);
  const dirty = JSON.stringify(profile) !== JSON.stringify(saved.profile);
  useEffect(() => {
    if (!dirty) return;
    const preventUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", preventUnload);
    return () => window.removeEventListener("beforeunload", preventUnload);
  }, [dirty]);
  function edit(patch: Partial<CommunityIntroduction>) { setProfile((current) => ({ ...current, ...patch })); setMessage(""); setError(false); setInvalidField(null); }
  function accept(snapshot: CommunityIntroductionSnapshot) {
    if (!Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0) throw new Error("INVALID_RESPONSE");
    const normalized = validateCommunityIntroduction(snapshot.profile);
    setSaved({ ...snapshot, profile: normalized }); setProfile(normalized); pending.current = null;
  }
  async function reload() {
    if (busy) return;
    setBusy(true); setMessage(""); setError(false);
    try {
      const response = await fetch("/api/admin/community-introduction", { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error("LOAD_FAILED");
      const body = await response.json() as { introduction: CommunityIntroductionSnapshot };
      accept(body.introduction); setInvalidField(null); setMessage("최신 소개를 불러왔습니다.");
    } catch { setError(true); setMessage("불러오지 못했습니다. 편집 중인 내용은 유지됩니다."); }
    finally { setBusy(false); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || !dirty) return;
    let normalized: CommunityIntroduction;
    try { normalized = validateCommunityIntroduction(profile); }
    catch (cause) {
      setError(true); setMessage(cause instanceof CommunityIntroductionValidationError ? cause.reason : "입력한 소개를 확인해 주세요.");
      setInvalidField(cause instanceof CommunityIntroductionValidationError ? cause.field : null); return;
    }
    const payload = JSON.stringify(normalized);
    if (pending.current?.payload !== payload || pending.current.revision !== saved.revision) pending.current = { payload, revision: saved.revision, key: crypto.randomUUID() };
    setBusy(true); setMessage(""); setError(false); setInvalidField(null);
    try {
      const response = await fetch("/api/admin/community-introduction", { method: "PUT", credentials: "same-origin", headers: {
        "Content-Type": "application/json", "If-Match": `"${saved.revision}"`, "Idempotency-Key": pending.current.key,
      }, body: payload });
      if (!response.ok) {
        setError(true);
        setMessage(response.status === 412 ? "다른 관리자가 먼저 저장했습니다. 편집 내용을 확인한 뒤 최신 소개를 다시 불러와 주세요."
          : response.status === 401 || response.status === 403 ? "관리자 로그인과 권한을 확인해 주세요. 편집 중인 내용은 유지됩니다."
            : response.status === 400 || response.status === 413 ? "입력한 글자 수와 HTTPS 주소를 확인해 주세요."
              : "저장 결과를 확인하지 못했습니다. 같은 내용으로 다시 저장할 수 있습니다.");
        if (response.status < 500) pending.current = null;
        return;
      }
      const body = await response.json() as { introduction: CommunityIntroductionSnapshot };
      accept(body.introduction);
      setMessage(body.introduction.profile.published ? "공개 소개를 저장했습니다. GG HUB에서 소개를 다시 열면 최신 내용을 확인할 수 있습니다." : "소개를 비공개로 저장했습니다. 작성한 내용은 유지됩니다.");
    } catch { setError(true); setMessage("저장 결과를 확인하지 못했습니다. 같은 내용으로 다시 저장하면 중복 요청을 방지해 처리합니다."); }
    finally { setBusy(false); }
  }
  return <div className={styles.workspace}>
    <form onSubmit={save} className={styles.form} aria-busy={busy}>
      <fieldset disabled={busy} className={styles.fields}><legend className="sr-only">공개 소개 편집</legend>
        <label className={styles.visibility}><input type="checkbox" checked={profile.published} onChange={(event) => edit({ published: event.target.checked })} />
          <span><strong>GG HUB에 상세 소개 공개</strong><small>켜고 저장하면 소개 내용이 공개됩니다. 끄면 작성한 내용은 보존되고 기본 사이트 정보만 표시됩니다.</small></span></label>
        {textFields.map(({ key, label, maximum, rows, hint }) => <label className={styles.field} key={key} htmlFor={`intro-${key}`}>
          <span>{label}{key === "summary" || key === "introduction" ? <small> 공개 시 필수</small> : <small> 선택</small>}</span>
          {key === "summary" || key === "activityHours" ? <Input id={`intro-${key}`} maxLength={maximum} value={profile[key]} required={profile.published && key === "summary"}
            aria-invalid={invalidField === key || undefined} aria-describedby={`intro-${key}-hint`} onChange={(event) => edit({ [key]: event.target.value })} />
            : <textarea id={`intro-${key}`} rows={rows} maxLength={maximum} value={profile[key]} required={profile.published && key === "introduction"}
              aria-invalid={invalidField === key || undefined} aria-describedby={`intro-${key}-hint`} onChange={(event) => edit({ [key]: event.target.value })} />}
          <span id={`intro-${key}-hint`} className={styles.fieldHint}>{hint}<span>{profile[key].length}/{maximum}</span></span>
        </label>)}
        <label className={styles.field} htmlFor="intro-contactUrl"><span>공개 문의 주소 <small>선택</small></span>
          <Input id="intro-contactUrl" type="url" value={profile.contactUrl ?? ""} placeholder="https://..." maxLength={500} aria-invalid={invalidField === "contactUrl" || undefined} onChange={(event) => edit({ contactUrl: event.target.value || null })} />
          <small>방문자에게 공개할 문의 페이지의 HTTPS 주소입니다.</small></label>
        <label className={styles.field} htmlFor="intro-bannerUrl"><span>소개 배너 이미지 주소 <small>선택</small></span>
          <Input id="intro-bannerUrl" type="url" value={profile.bannerUrl ?? ""} placeholder="https://..." maxLength={500} aria-invalid={invalidField === "bannerUrl" || undefined} onChange={(event) => edit({ bannerUrl: event.target.value || null })} />
          <small>공개 HTTPS 이미지 주소를 사용합니다. 이 설정은 사이트 테마 배너를 바꾸지 않습니다.</small></label>
      </fieldset>
      {message ? <p className={error ? styles.error : styles.notice} role={error ? "alert" : "status"}>{message}</p> : null}
      <div className={styles.actions}><Button type="submit" disabled={busy || !dirty}>{busy ? "처리 중…" : "소개 저장"}</Button>
        <Button type="button" variant="outline" disabled={busy} onClick={reload}>{dirty ? "편집 취소하고 최신 소개 불러오기" : "최신 소개 불러오기"}</Button></div>
      <p className={styles.savedState}>{dirty ? "저장하지 않은 변경이 있습니다." : `저장 버전 ${saved.revision}`} · 현재 저장 상태: {saved.profile.published ? "공개" : "비공개"}</p>
    </form>
    <aside className={styles.preview} aria-labelledby="introduction-preview-title"><header><p>미리보기 · 저장 전</p><h2 id="introduction-preview-title">{communityName}</h2>
      <span>{profile.published ? "저장하면 아래 내용이 공개됩니다." : "현재 비공개 초안입니다. 아래 내용은 편집 미리보기입니다."}</span></header>
      {profile.summary || profile.introduction || profile.activities || profile.activityHours || profile.joiningInfo || profile.bannerUrl || profile.contactUrl
        ? <IntroductionContent profile={profile} headingLevel={3} /> : <p className={styles.emptyPreview}>소개를 입력하면 여기에 미리 보입니다.</p>}
    </aside>
  </div>;
}
