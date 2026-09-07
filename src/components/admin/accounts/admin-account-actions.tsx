"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import type { AdminAccountDto } from "@/modules/accounts/domain/account-contracts";
import styles from "@/components/admin/players/admin-players.module.css";
import {
  advanceLatestRevision,
  advanceOneTimeSecretEpoch,
  canPresentOneTimeSecret,
  isOneTimeSecretRevisionCurrent,
  shouldApplyRevisionProjection,
  shouldRestoreOneTimeSecretPage,
} from "@/platform/security/one-time-secret-lifecycle";

function responseMessage(value: unknown) {
  if (!value || typeof value !== "object") return "작업을 완료하지 못했습니다.";
  const body = value as { detail?: unknown; message?: unknown };
  return typeof body.detail === "string" ? body.detail : typeof body.message === "string" ? body.message : "작업을 완료하지 못했습니다.";
}

function nextStatusChoice(status: AdminAccountDto["status"]) {
  return status === "APPROVED" ? "SUSPENDED" : "APPROVED";
}

export function AdminAccountActions({
  initialAccount,
  actor,
}: {
  initialAccount: AdminAccountDto;
  actor: { id: string; role: "ADMIN" | "SUPER_ADMIN" };
}) {
  const router = useRouter();
  const [account, setAccount] = useState(initialAccount);
  const [sourceRevision, setSourceRevision] = useState(initialAccount.revision);
  const [busy, setBusy] = useState<string | null>(null);
  const [statusAction, setStatusAction] = useState(nextStatusChoice(initialAccount.status));
  const [roleAction, setRoleAction] = useState<"USER" | "ADMIN">(
    initialAccount.role === "ADMIN" ? "USER" : "ADMIN",
  );
  const [message, setMessage] = useState<{ text: string; tone: "error" | "success" } | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const [temporaryPasswordRevision, setTemporaryPasswordRevision] = useState<number | null>(null);
  const [secretVisible, setSecretVisible] = useState(false);
  const [secretMessage, setSecretMessage] = useState("");
  const latestRevisionRef = useRef(initialAccount.revision);
  const temporaryPasswordRef = useRef<string | null>(null);
  const temporaryPasswordRevisionRef = useRef<number | null>(null);
  const hiddenSecretCleanupPendingRef = useRef(false);
  const secretLifecycleEpochRef = useRef(0);
  const pageHiddenSinceMountRef = useRef(false);
  const keys = useRef(new Map<string, string>());
  const secretBox = useRef<HTMLDivElement>(null);

  function applyAccountProjection(nextAccount: AdminAccountDto) {
    if (!shouldApplyRevisionProjection({
      latestRevision: latestRevisionRef.current,
      projectionRevision: nextAccount.revision,
    })) return false;

    latestRevisionRef.current = advanceLatestRevision(
      latestRevisionRef.current,
      nextAccount.revision,
    );
    setAccount(nextAccount);
    setStatusAction(nextStatusChoice(nextAccount.status));
    setRoleAction(nextAccount.role === "ADMIN" ? "USER" : "ADMIN");

    const issuedRevision = temporaryPasswordRevisionRef.current;
    if (
      temporaryPasswordRef.current !== null
      && (
        issuedRevision === null
        || !isOneTimeSecretRevisionCurrent({
          latestRevision: latestRevisionRef.current,
          issuedRevision,
        })
      )
    ) {
      secretLifecycleEpochRef.current = advanceOneTimeSecretEpoch(secretLifecycleEpochRef.current);
      temporaryPasswordRef.current = null;
      temporaryPasswordRevisionRef.current = null;
      hiddenSecretCleanupPendingRef.current = false;
      setTemporaryPassword(null);
      setTemporaryPasswordRevision(null);
      setSecretVisible(false);
      setSecretMessage("");
      setMessage({
        text: "계정 정보가 더 최신 revision으로 변경되어 이전 일회성 임시 비밀번호 표시를 삭제했습니다. 대상 아이디를 다시 확인해 새 초기화를 진행해 주세요.",
        tone: "error",
      });
    }

    return true;
  }

  if (sourceRevision !== initialAccount.revision) {
    setSourceRevision(initialAccount.revision);
    if (shouldApplyRevisionProjection({
      latestRevision: account.revision,
      projectionRevision: initialAccount.revision,
    })) {
      setAccount(initialAccount);
      setStatusAction(nextStatusChoice(initialAccount.status));
      setRoleAction(initialAccount.role === "ADMIN" ? "USER" : "ADMIN");
      if (
        temporaryPassword !== null
        && (
          temporaryPasswordRevision === null
          || !isOneTimeSecretRevisionCurrent({
            latestRevision: initialAccount.revision,
            issuedRevision: temporaryPasswordRevision,
          })
        )
      ) {
        setTemporaryPassword(null);
        setTemporaryPasswordRevision(null);
        setSecretVisible(false);
        setSecretMessage("");
        setMessage({
          text: "계정 정보가 더 최신 revision으로 변경되어 이전 일회성 임시 비밀번호 표시를 삭제했습니다. 대상 아이디를 다시 확인해 새 초기화를 진행해 주세요.",
          tone: "error",
        });
      }
    }
  }

  useLayoutEffect(() => {
    latestRevisionRef.current = advanceLatestRevision(
      latestRevisionRef.current,
      account.revision,
    );
    if (temporaryPassword === null && temporaryPasswordRef.current !== null) {
      secretLifecycleEpochRef.current = advanceOneTimeSecretEpoch(secretLifecycleEpochRef.current);
      temporaryPasswordRef.current = null;
      temporaryPasswordRevisionRef.current = null;
      hiddenSecretCleanupPendingRef.current = false;
    }
  }, [account.revision, temporaryPassword]);

  const targetAllowed = account.deletedAt === null && account.role !== "SUPER_ADMIN" && account.id !== actor.id && (actor.role === "SUPER_ADMIN" || account.role === "USER");
  const superTargetAllowed = actor.role === "SUPER_ADMIN" && account.role !== "SUPER_ADMIN" && account.id !== actor.id;
  const superActiveAllowed = superTargetAllowed && account.deletedAt === null;
  const canReopenRejectedClaim = account.status === "PENDING" && account.playerClaimReview?.status === "REJECTED";
  const actionsUnavailable = busy !== null || temporaryPassword !== null;

  const clearTemporaryPassword = useCallback((reason: "DISMISSED" | "HIDDEN") => {
    const hadSecret = temporaryPasswordRef.current !== null || hiddenSecretCleanupPendingRef.current;
    secretLifecycleEpochRef.current = advanceOneTimeSecretEpoch(secretLifecycleEpochRef.current);
    temporaryPasswordRef.current = null;
    temporaryPasswordRevisionRef.current = null;
    hiddenSecretCleanupPendingRef.current = reason === "HIDDEN" && hadSecret;
    setTemporaryPassword(null);
    setTemporaryPasswordRevision(null);
    setSecretVisible(false);
    setSecretMessage("");
    if (!hadSecret) return;
    setMessage({
      text: reason === "DISMISSED"
        ? "일회성 임시 비밀번호 표시를 닫았습니다. 이 비밀번호는 다시 확인할 수 없습니다. 전달에 실패했다면 새 초기화를 진행해 주세요."
        : "화면을 벗어나 보안을 위해 일회성 임시 비밀번호 표시를 삭제했습니다. 이 비밀번호는 다시 확인할 수 없습니다.",
      tone: reason === "DISMISSED" ? "success" : "error",
    });
  }, []);

  useEffect(() => {
    const clearWhenHidden = () => {
      if (document.visibilityState === "hidden") {
        clearTemporaryPassword("HIDDEN");
      } else {
        hiddenSecretCleanupPendingRef.current = false;
        router.refresh();
      }
    };
    const clearWhenPageHides = () => {
      pageHiddenSinceMountRef.current = true;
      clearTemporaryPassword("HIDDEN");
    };
    const clearWhenRestored = (event: PageTransitionEvent) => {
      if (!shouldRestoreOneTimeSecretPage({
        persisted: event.persisted,
        pageHiddenSinceMount: pageHiddenSinceMountRef.current,
        cleanupPending: hiddenSecretCleanupPendingRef.current,
      })) return;
      clearTemporaryPassword("HIDDEN");
      hiddenSecretCleanupPendingRef.current = false;
      pageHiddenSinceMountRef.current = false;
      router.refresh();
    };
    window.addEventListener("pagehide", clearWhenPageHides);
    window.addEventListener("pageshow", clearWhenRestored);
    document.addEventListener("visibilitychange", clearWhenHidden);
    return () => {
      window.removeEventListener("pagehide", clearWhenPageHides);
      window.removeEventListener("pageshow", clearWhenRestored);
      document.removeEventListener("visibilitychange", clearWhenHidden);
    };
  }, [clearTemporaryPassword, router]);

  useEffect(() => {
    if (!temporaryPassword) return;
    secretBox.current?.focus();
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = true;
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [temporaryPassword]);

  function typedConfirmationMatches(data: FormData) {
    return String(data.get("confirmLoginId") ?? "").trim().normalize("NFKC") === account.loginId.normalize("NFKC");
  }

  function requireTypedConfirmation(data: FormData) {
    if (typedConfirmationMatches(data)) return true;
    setMessage({ text: `대상 확인란에 ${account.loginId} 아이디를 정확히 입력해 주세요.`, tone: "error" });
    return false;
  }

  async function mutate(action: string, path: string, method: "DELETE" | "PATCH" | "POST", payload: Record<string, unknown>) {
    if (temporaryPassword) {
      setSecretMessage("임시 비밀번호를 복사하고 ‘복사 완료 · 닫기’를 누른 뒤 다른 작업을 진행해 주세요.");
      secretBox.current?.focus();
      return;
    }
    const fingerprint = JSON.stringify({ action, revision: account.revision, payload });
    let key = keys.current.get(fingerprint);
    if (!key) {
      key = `admin-${crypto.randomUUID()}-${crypto.randomUUID()}`;
      keys.current.set(fingerprint, key);
    }
    setBusy(action);
    setMessage(null);
    setSecretVisible(false);
    setSecretMessage("");
    const secretRequestEpoch = secretLifecycleEpochRef.current;
    try {
      const response = await fetch(path, {
        method,
        headers: {
          "Content-Type": "application/json",
          "If-Match": `"${account.revision}"`,
          "Idempotency-Key": key,
        },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => null) as {
        account?: AdminAccountDto;
        code?: string;
        temporaryPassword?: string;
      } | null;
      if (!response.ok) {
        if (body?.code === "ONE_TIME_SECRET_ALREADY_ISSUED") {
          keys.current.delete(fingerprint);
          const latest = await fetch(`/api/admin/users/${account.id}`, { cache: "no-store" })
            .then(async (result) => result.ok
              ? (await result.json() as { account?: AdminAccountDto }).account ?? null
              : null)
            .catch(() => null);
          if (latest) {
            applyAccountProjection(latest);
            router.refresh();
          }
          setMessage({
            text: "이전 발급은 처리됐지만 응답이 유실되었을 수 있어 비밀번호를 복구할 수 없습니다. 대상 아이디를 다시 확인해 새 임시 비밀번호 발급 작업을 시작해 주세요.",
            tone: "error",
          });
          return;
        }
        if (response.status === 412) {
          keys.current.delete(fingerprint);
          const latest = await fetch(`/api/admin/users/${account.id}`, { cache: "no-store" })
            .then(async (result) => result.ok
              ? (await result.json() as { account?: AdminAccountDto }).account ?? null
              : null)
            .catch(() => null);
          if (latest) {
            applyAccountProjection(latest);
            setMessage({
              text: "다른 작업으로 계정 정보가 변경되어 최신값을 불러왔습니다. 현재 상태를 비교한 뒤 다시 실행해 주세요.",
              tone: "error",
            });
            router.refresh();
          } else {
            setMessage({
              text: "계정이 변경되었지만 최신 정보를 불러오지 못했습니다. 네트워크를 확인하고 페이지를 새로고침해 주세요.",
              tone: "error",
            });
          }
          return;
        }
        setMessage({ text: responseMessage(body), tone: "error" });
        return;
      }
      const responseRevision = body?.account?.revision;
      const responseProjectionApplied = body?.account
        ? applyAccountProjection(body.account)
        : true;
      const secretMatchesLatestRevision = typeof responseRevision === "number"
        && Number.isSafeInteger(responseRevision)
        && isOneTimeSecretRevisionCurrent({
          latestRevision: latestRevisionRef.current,
          issuedRevision: responseRevision,
        });
      const secretCanBePresented = body?.temporaryPassword
        ? canPresentOneTimeSecret({
            requestEpoch: secretRequestEpoch,
            currentEpoch: secretLifecycleEpochRef.current,
            visibilityState: document.visibilityState,
          })
          && responseProjectionApplied
          && secretMatchesLatestRevision
        : false;
      if (body?.temporaryPassword && secretCanBePresented) {
        temporaryPasswordRef.current = body.temporaryPassword;
        temporaryPasswordRevisionRef.current = responseRevision ?? null;
        hiddenSecretCleanupPendingRef.current = false;
        setTemporaryPassword(body.temporaryPassword);
        setTemporaryPasswordRevision(responseRevision ?? null);
      } else if (body?.temporaryPassword) {
        temporaryPasswordRef.current = null;
        temporaryPasswordRevisionRef.current = null;
        hiddenSecretCleanupPendingRef.current = true;
        setTemporaryPassword(null);
        setTemporaryPasswordRevision(null);
        setSecretVisible(false);
        setSecretMessage("");
      }
      setMessage(body?.temporaryPassword && !secretCanBePresented
        ? {
            text: !responseProjectionApplied || !secretMatchesLatestRevision
              ? "응답보다 최신 계정 정보가 확인되어 과거 revision의 일회성 임시 비밀번호를 표시하지 않았습니다. 대상 아이디를 다시 확인해 새 초기화를 진행해 주세요."
              : "화면을 벗어난 동안 발급이 완료되어 일회성 임시 비밀번호를 표시하지 않았습니다. 대상 아이디를 다시 확인해 새 초기화를 진행해 주세요.",
            tone: "error",
          }
        : !responseProjectionApplied
          ? {
              text: "응답보다 최신 계정 정보가 이미 반영되어 과거 revision 응답은 적용하지 않았습니다.",
              tone: "error",
            }
          : { text: responseMessage(body), tone: "success" });
      // This component has stable account identity across an RSC refresh. The
      // parent summary can therefore load the committed revision immediately
      // while the one-time secret remains only in this in-memory child state.
      router.refresh();
    } catch {
      setMessage({ text: "네트워크 연결을 확인한 뒤 다시 시도해 주세요.", tone: "error" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className={styles.formCard} aria-labelledby="account-actions-title">
      <h2 id="account-actions-title">계정 작업</h2>
      <div className={styles.actionGrid}>
        <form className={styles.actionPanel} onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const action = String(data.get("statusAction") ?? "");
          const paths = { APPROVED: "approve", REJECTED: "reject", SUSPENDED: "suspend", PENDING: "reset-pending" } as const;
          if (!(action in paths)) return;
          if (action === account.status && !(action === "PENDING" && canReopenRejectedClaim)) {
            setMessage({ text: "현재 상태와 다른 상태를 선택해 주세요.", tone: "error" });
            return;
          }
          if ((action === "REJECTED" || action === "SUSPENDED" || action === "PENDING") && !requireTypedConfirmation(data)) return;
          void mutate(`status-${action}`, `/api/admin/users/${account.id}/${paths[action as keyof typeof paths]}`, "PATCH", {
            publicReason: String(data.get("publicReason") ?? "").trim() || null,
            internalReason: String(data.get("internalReason") ?? ""),
            ...(action === "APPROVED"
              ? {
                  expectedClaimId: account.playerClaimReview?.status === "PENDING"
                    ? account.playerClaimReview.id
                    : null,
                  claimOwnershipReviewed: data.get("claimOwnershipReviewed") === "on",
                }
              : { confirmLoginId: String(data.get("confirmLoginId") ?? "") }),
          });
        }}>
          <h3>승인 상태</h3><p>관리자(ADMIN)는 일반 사용자(USER)만, 최고 관리자(SUPER_ADMIN)는 관리자(ADMIN)까지 변경할 수 있습니다. 모든 세션이 종료됩니다.</p>
          <label>다음 상태<select name="statusAction" value={statusAction} onChange={(event) => setStatusAction(event.target.value)} disabled={!targetAllowed}><option value="APPROVED" disabled={account.status === "APPROVED"}>승인</option><option value="REJECTED" disabled={account.status === "REJECTED"}>거절</option><option value="SUSPENDED" disabled={account.status === "SUSPENDED"}>이용 제한</option><option value="PENDING" disabled={account.status === "PENDING" && !canReopenRejectedClaim}>{canReopenRejectedClaim ? "해제된 claim 안전 재검토" : "승인 대기로 초기화"}</option></select></label>
          {canReopenRejectedClaim ? <p className={styles.inactiveNotice}>삭제 시 해제된 claim입니다. 대상 플레이어가 여전히 미연결이고 다른 대기 claim이 없을 때만 다시 열립니다.</p> : null}
          {statusAction === "APPROVED" && account.playerClaimReview?.status === "PENDING" ? (
            <label className={styles.confirmCheck}>
              <input name="claimOwnershipReviewed" type="checkbox" required />
              <span>가입 입력값과 기존 플레이어를 대조했습니다. 이는 Riot 소유권 검증이 아니라 관리자 수동 검토 확인입니다.</span>
            </label>
          ) : null}
          {statusAction !== "APPROVED" ? <label>대상 확인<input name="confirmLoginId" autoComplete="off" placeholder={account.loginId} required /><small>실행할 계정의 로그인 아이디를 입력하세요.</small></label> : null}
          <label>사용자 안내 사유<input name="publicReason" maxLength={500} placeholder="계정 화면에 표시됩니다" /></label>
          <label>내부 운영 사유<textarea name="internalReason" minLength={2} maxLength={1000} required /></label>
          <button type="submit" disabled={!targetAllowed || actionsUnavailable}>{busy?.startsWith("status") ? "처리 중…" : "상태 변경"}</button>
        </form>

        <form className={styles.actionPanel} onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          if (!requireTypedConfirmation(data)) return;
          void mutate("2fa-reset", `/api/admin/users/${account.id}/2fa-reset`, "PATCH", {
            internalReason: String(data.get("internalReason") ?? ""),
            confirmLoginId: String(data.get("confirmLoginId") ?? ""),
          });
        }}>
          <h3>관리자 2단계 인증 초기화</h3>
          <p>최고 관리자(SUPER_ADMIN)만 다른 관리자(ADMIN)의 등록 정보를 제거할 수 있습니다. 대상의 모든 세션이 종료되며 다음 관리자 로그인에서 다시 등록해야 합니다.</p>
          <label>내부 운영 사유<textarea name="internalReason" minLength={2} maxLength={1000} required /></label>
          <label>대상 확인<input name="confirmLoginId" autoComplete="off" placeholder={account.loginId} required /></label>
          <button data-tone="danger" type="submit" disabled={!superActiveAllowed || account.role !== "ADMIN" || !account.adminTotpConfigured || actionsUnavailable}>{busy === "2fa-reset" ? "초기화 중…" : account.adminTotpConfigured ? "2단계 인증 초기화" : "등록된 2단계 인증 없음"}</button>
        </form>

        <form className={styles.actionPanel} onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          if (!requireTypedConfirmation(data)) return;
          void mutate("role", `/api/admin/users/${account.id}/role`, "PATCH", { role: roleAction, internalReason: String(data.get("internalReason") ?? ""), confirmLoginId: String(data.get("confirmLoginId") ?? "") });
        }}>
          <h3>역할</h3><p>최고 관리자(SUPER_ADMIN)만 일반 사용자(USER)↔관리자(ADMIN)를 변경할 수 있고 최고 관리자 역할은 웹에서 부여하거나 회수할 수 없습니다.</p>
          <label>다음 역할<select name="role" value={roleAction} onChange={(event) => setRoleAction(event.target.value as "USER" | "ADMIN")} disabled={!superActiveAllowed}><option value="USER" disabled={account.role === "USER"}>일반 사용자 (USER)</option><option value="ADMIN" disabled={account.role === "ADMIN"}>관리자 (ADMIN)</option></select></label>
          <label>내부 운영 사유<textarea name="internalReason" minLength={2} maxLength={1000} required /></label>
          <label>대상 확인<input name="confirmLoginId" autoComplete="off" placeholder={account.loginId} required /></label>
          <button type="submit" disabled={!superActiveAllowed || actionsUnavailable}>{busy === "role" ? "처리 중…" : "역할 변경"}</button>
        </form>

        <form className={styles.actionPanel} onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          if (!requireTypedConfirmation(data)) return;
          void mutate("password-reset", `/api/admin/users/${account.id}/password-reset`, "PATCH", { internalReason: String(data.get("internalReason") ?? ""), confirmLoginId: String(data.get("confirmLoginId") ?? "") });
        }}>
          <h3>임시 비밀번호</h3><p>응답에서 한 번만 표시되며 DB·감사·receipt에는 원문이 저장되지 않습니다.</p>
          <label>내부 운영 사유<textarea name="internalReason" minLength={2} maxLength={1000} required /></label>
          <label>대상 확인<input name="confirmLoginId" autoComplete="off" placeholder={account.loginId} required /></label>
          <button type="submit" disabled={!superActiveAllowed || actionsUnavailable}>{busy === "password-reset" ? "발급 중…" : temporaryPassword ? "임시 비밀번호 확인 필요" : "임시 비밀번호 발급"}</button>
          {temporaryPassword ? <div className={styles.secretBox} ref={secretBox} tabIndex={-1} aria-label="일회용 임시 비밀번호 확인">
            <code aria-label={secretVisible ? "임시 비밀번호가 표시됨" : "임시 비밀번호가 가려짐"}>{secretVisible ? temporaryPassword : "••••••••••••••••••••"}</code>
            <div><button type="button" aria-pressed={secretVisible} onClick={() => setSecretVisible((visible) => !visible)}>{secretVisible ? "숨기기" : "보기"}</button><button type="button" onClick={async () => {
              try {
                await navigator.clipboard.writeText(temporaryPassword);
                setSecretMessage("임시 비밀번호를 클립보드에 복사했습니다.");
              } catch {
                setSecretMessage("복사하지 못했습니다. 보기를 눌러 안전한 곳에 직접 옮겨 주세요.");
              }
            }}>복사</button><button type="button" onClick={() => {
              clearTemporaryPassword("DISMISSED");
            }}>복사 완료 · 닫기</button></div>
            <p role="status" aria-live="polite">{secretMessage || "임시 비밀번호가 발급되었습니다. 보기 또는 복사를 선택하세요."}</p>
            <small>닫거나 페이지를 떠난 뒤에는 다시 표시할 수 없습니다. 전달에 실패했다면 새 초기화 작업을 진행하세요.</small>
          </div> : null}
        </form>

        <form className={styles.actionPanel} onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const restoring = account.deletedAt !== null;
          if (!requireTypedConfirmation(data)) return;
          void mutate(restoring ? "restore" : "delete", `/api/admin/users/${account.id}${restoring ? "/restore" : ""}`, restoring ? "PATCH" : "DELETE", { internalReason: String(data.get("internalReason") ?? ""), confirmLoginId: String(data.get("confirmLoginId") ?? "") });
        }}>
          <h3>{account.deletedAt ? "계정 복구" : "소프트 삭제"}</h3><p>연결된 플레이어와 기록은 보존하되 공개 비활성화하고, 대기 claim과 활성 복구 요청은 해제합니다. 복구 시 claim을 다시 잠가 선점 여부를 확인하며, 다른 계정이 선점했다면 복구 전체가 취소됩니다. 관리자(ADMIN) 삭제 시 2단계 인증을 제거하고 비밀번호 변경을 강제합니다.</p>
          <label>내부 운영 사유<textarea name="internalReason" minLength={2} maxLength={1000} required /></label>
          <label>대상 확인<input name="confirmLoginId" autoComplete="off" placeholder={account.loginId} required /></label>
          <button data-tone={account.deletedAt ? undefined : "danger"} type="submit" disabled={!superTargetAllowed || actionsUnavailable}>{busy === "delete" || busy === "restore" ? "처리 중…" : account.deletedAt ? "계정 복구" : "계정 소프트 삭제"}</button>
        </form>
      </div>
      {account.deletedAt ? <p className={styles.inactiveNotice}>삭제 계정에서는 복구 외 상태·역할·비밀번호 작업을 실행할 수 없습니다.</p> : null}
      <div className={styles.formMessage} data-tone={message?.tone} role={message?.tone === "error" ? "alert" : "status"} aria-live="polite">{message?.text ?? "작업은 revision·멱등성 키·감사·세션 폐기를 같은 트랜잭션에서 검증합니다."}</div>
    </section>
  );
}
