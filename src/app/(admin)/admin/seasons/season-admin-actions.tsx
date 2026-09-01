"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { AdminSeason, AdminSeasonApplication, SeasonApplicationStatus } from "@/modules/seasons";
import { ClientMutationKeyStore } from "@/modules/seasons/application/client-mutation-key-store";
import { kstDateTimeLocalFromIso, kstIsoFromDateTimeLocal } from "@/modules/seasons/application/client-season-time";

import styles from "./seasons.module.css";

type ProblemBody = { detail?: string; title?: string };

async function mutate(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  revision: number,
  body: Record<string, unknown>,
  keys: ClientMutationKeyStore,
) {
  const ticket = keys.issue(`${method}:${path}`, revision, body);
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Idempotency-Key": ticket.key,
      "If-Match": `"${revision}"`,
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as ProblemBody;
  if (!response.ok) throw new Error(payload.detail || payload.title || "요청을 처리하지 못했습니다.");
  keys.complete(ticket);
  return payload;
}

function seasonDates(formData: FormData) {
  return {
    applicationsOpenAt: kstIsoFromDateTimeLocal(String(formData.get("applicationsOpenAt") ?? "")),
    applicationsCloseAt: kstIsoFromDateTimeLocal(String(formData.get("applicationsCloseAt") ?? "")),
    startsAt: kstIsoFromDateTimeLocal(String(formData.get("startsAt") ?? "")),
    endsAt: kstIsoFromDateTimeLocal(String(formData.get("endsAt") ?? "")),
  };
}

export function CreateSeasonForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const keys = useRef(new ClientMutationKeyStore("admin-season-create")).current;

  async function submit(formData: FormData) {
    setPending(true);
    setMessage(null);
    try {
      await mutate("/api/admin/seasons", "POST", 0, {
        name: String(formData.get("name") ?? ""),
        ...seasonDates(formData),
      }, keys);
      setMessage("초안 시즌을 만들었습니다.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "시즌을 만들지 못했습니다.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className={styles.createForm} action={submit}>
      <label>시즌 이름<input name="name" maxLength={120} required placeholder="예: 2026 가을 시즌" /></label>
      <label>신청 시작<input name="applicationsOpenAt" type="datetime-local" /></label>
      <label>신청 종료<input name="applicationsCloseAt" type="datetime-local" /></label>
      <label>시즌 시작<input name="startsAt" type="datetime-local" /></label>
      <label>시즌 종료<input name="endsAt" type="datetime-local" /></label>
      <button type="submit" disabled={pending}>{pending ? "생성 중…" : "초안 시즌 만들기"}</button>
      {message ? <p role="status">{message}</p> : null}
    </form>
  );
}

export function SeasonRowActions({ season }: { season: AdminSeason }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const keys = useRef(new ClientMutationKeyStore(`admin-season-${season.id}`)).current;

  async function action(name: string, path: string, method: "POST" | "DELETE", body = {}) {
    setPending(name);
    setMessage(null);
    try {
      await mutate(path, method, season.revision, body, keys);
      setMessage("변경을 반영했습니다.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "변경하지 못했습니다.");
    } finally {
      setPending(null);
    }
  }

  async function edit(formData: FormData) {
    setPending("edit");
    setMessage(null);
    try {
      await mutate(`/api/admin/seasons/${season.id}`, "PATCH", season.revision, {
        name: String(formData.get("name") ?? ""),
        ...seasonDates(formData),
      }, keys);
      setMessage("시즌 정보를 수정했습니다.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "수정하지 못했습니다.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className={styles.rowActions}>
      <div>
        {season.status === "DRAFT" ? (
          <button type="button" aria-label={`${season.name} 활성화`} disabled={Boolean(pending)} onClick={() => action("activate", `/api/admin/seasons/${season.id}/activate`, "POST")}>활성화</button>
        ) : null}
        {season.status === "ACTIVE" ? (
          <button type="button" aria-label={`${season.name} 종료`} disabled={Boolean(pending)} onClick={() => action("end", `/api/admin/seasons/${season.id}/end`, "POST")}>종료</button>
        ) : null}
        {season.status !== "RETIRED" ? (
          <button type="button" aria-label={`${season.name} 복제`} disabled={Boolean(pending)} onClick={() => action("clone", `/api/admin/seasons/${season.id}/clone`, "POST", {})}>복제</button>
        ) : null}
        {season.status === "DRAFT" ? (
          <button type="button" aria-label={`${season.name} 보관`} data-variant="danger" disabled={Boolean(pending)} onClick={() => action("retire", `/api/admin/seasons/${season.id}`, "DELETE", {})}>보관</button>
        ) : null}
      </div>
      {season.status === "DRAFT" || season.status === "ACTIVE" ? (
        <details>
          <summary aria-label={`${season.name} 편집`}>편집</summary>
          <form action={edit}>
            <label>이름<input name="name" required maxLength={120} defaultValue={season.name} /></label>
            <label>신청 시작<input name="applicationsOpenAt" type="datetime-local" defaultValue={kstDateTimeLocalFromIso(season.applicationsOpenAt)} /></label>
            <label>신청 종료<input name="applicationsCloseAt" type="datetime-local" defaultValue={kstDateTimeLocalFromIso(season.applicationsCloseAt)} /></label>
            <label>시즌 시작<input name="startsAt" type="datetime-local" defaultValue={kstDateTimeLocalFromIso(season.startsAt)} /></label>
            <label>시즌 종료<input name="endsAt" type="datetime-local" defaultValue={kstDateTimeLocalFromIso(season.endsAt)} /></label>
            <button type="submit" disabled={Boolean(pending)}>저장</button>
          </form>
        </details>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
    </div>
  );
}

export function ReviewApplicationForm({ application }: { application: AdminSeasonApplication }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const keys = useRef(new ClientMutationKeyStore(`admin-review-${application.id}`)).current;

  async function submit(formData: FormData) {
    setPending(true);
    setMessage(null);
    try {
      await mutate(
        `/api/admin/season-applications/${application.id}/review`,
        "POST",
        application.revision,
        {
          status: String(formData.get("status") ?? ""),
          reviewNote: String(formData.get("reviewNote") ?? ""),
        },
        keys,
      );
      setMessage("검토 상태를 저장했습니다.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "검토를 저장하지 못했습니다.");
    } finally {
      setPending(false);
    }
  }

  const options: SeasonApplicationStatus[] = ["CONFIRMED", "RESERVE", "REJECTED"];
  return (
    <form className={styles.reviewForm} action={submit}>
      <label>
        <span className="sr-only">{application.player.displayName} 신청 상태</span>
        <select name="status" defaultValue={options.includes(application.status) ? application.status : "CONFIRMED"} disabled={pending}>
          <option value="CONFIRMED">확정</option>
          <option value="RESERVE">예비</option>
          <option value="REJECTED">거절</option>
        </select>
      </label>
      <label>
        <span className="sr-only">관리자 검토 메모</span>
        <input name="reviewNote" maxLength={1000} defaultValue={application.reviewNote ?? ""} placeholder="내부 검토 메모" disabled={pending} />
      </label>
      <button type="submit" aria-label={`${application.player.displayName} 신청 검토 저장`} disabled={pending}>{pending ? "저장 중…" : "검토 저장"}</button>
      {message ? <small role="status">{message}</small> : null}
    </form>
  );
}
