"use client";

import { useState, type FormEvent } from "react";
import { Check, Clipboard, KeyRound, LoaderCircle, RotateCcw, ShieldOff } from "lucide-react";
import { useRouter } from "next/navigation";
import type { AdminTotpStatus } from "@/modules/auth/infrastructure/admin-totp-lifecycle";
import styles from "./admin-totp-security-panel.module.css";

type SetupMaterial = Readonly<{
  manualSecret: string;
  provisioningUri: string;
}>;

type ProblemPayload = {
  code?: string;
  detail?: string;
  title?: string;
};

type AdminTotpSecurityPanelProps = {
  initialStatus: AdminTotpStatus | "UNAVAILABLE";
};

async function responsePayload(response: Response): Promise<Record<string, unknown>> {
  return response.json().catch(() => ({})) as Promise<Record<string, unknown>>;
}

function errorMessage(payload: ProblemPayload) {
  return payload.detail ?? payload.title ?? "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

export function AdminTotpSecurityPanel({ initialStatus }: AdminTotpSecurityPanelProps) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [setupMaterial, setSetupMaterial] = useState<SetupMaterial | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function request(path: string, method: "POST" | "DELETE", body: object) {
    setPendingAction(`${method}:${path}`);
    setMessage("");
    setError("");
    const response = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    setPendingAction(null);
    if (!response) {
      setError("네트워크 연결을 확인하고 다시 시도해 주세요.");
      return null;
    }
    return { response, payload: await responsePayload(response) };
  }

  async function beginSetup() {
    const result = await request("/api/admin/security/totp/setup", "POST", {});
    if (!result) return;
    if (!result.response.ok) {
      setError(errorMessage(result.payload));
      if (result.payload.code === "TOTP_SETUP_PENDING") setStatus("SETUP_PENDING");
      return;
    }

    const manualSecret = result.payload.manualSecret;
    const provisioningUri = result.payload.provisioningUri;
    if (typeof manualSecret !== "string" || typeof provisioningUri !== "string") {
      setError("등록 키 응답을 확인할 수 없습니다. 등록 시도를 취소한 뒤 다시 시작해 주세요.");
      setStatus("SETUP_PENDING");
      return;
    }
    setSetupMaterial({ manualSecret, provisioningUri });
    setStatus("SETUP_PENDING");
    setMessage("새 등록 키를 만들었습니다. 이 화면을 닫기 전에 인증 앱에 저장해 주세요.");
  }

  async function cancelSetup() {
    const result = await request("/api/admin/security/totp/setup", "DELETE", {});
    if (!result) return;
    if (!result.response.ok) {
      setError(errorMessage(result.payload));
      return;
    }
    setSetupMaterial(null);
    setStatus("NOT_CONFIGURED");
    setMessage("진행 중인 등록 시도를 취소했습니다. 이제 새 등록 키를 만들 수 있습니다.");
  }

  async function submitCode(
    event: FormEvent<HTMLFormElement>,
    action: "enable" | "disable",
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    const code = String(new FormData(form).get("code") ?? "");
    const result = await request(`/api/admin/security/totp/${action}`, "POST", { code });
    if (!result) return;
    if (!result.response.ok) {
      setError(errorMessage(result.payload));
      return;
    }

    form.reset();
    router.replace("/admin/login?next=%2Fadmin%2Fsecurity");
    router.refresh();
  }

  async function copyValue(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setMessage(`${label}를 클립보드에 복사했습니다.`);
      setError("");
    } catch {
      setError("자동 복사에 실패했습니다. 값을 직접 선택해 복사해 주세요.");
    }
  }

  const busy = pendingAction !== null;

  return (
    <div className={styles.panel} aria-busy={busy}>
      <div className={styles.statusRow}>
        <span className={styles.statusLabel}>현재 상태</span>
        <strong data-status={status}>
          {status === "ENABLED" ? "활성화됨" : status === "SETUP_PENDING"
            ? "등록 진행 중" : status === "NOT_CONFIGURED" ? "등록되지 않음" : "저장소 연결 필요"}
        </strong>
      </div>

      {status === "UNAVAILABLE" ? (
        <p className={styles.notice} role="status">
          DB 기반 관리자 보안 저장소가 연결된 격리 환경에서만 등록 상태를 변경할 수 있습니다.
        </p>
      ) : null}

      {status === "NOT_CONFIGURED" ? (
        <section className={styles.section} aria-labelledby="totp-start-title">
          <h2 id="totp-start-title"><KeyRound aria-hidden="true" /> 인증 앱 등록 시작</h2>
          <p>20바이트 무작위 키를 만들고 AES-256-GCM으로 암호화해 비활성 상태로 저장합니다.</p>
          <button type="button" onClick={beginSetup} disabled={busy}>
            {pendingAction?.includes("setup") ? <LoaderCircle className={styles.spin} aria-hidden="true" /> : <KeyRound aria-hidden="true" />}
            새 등록 키 만들기
          </button>
        </section>
      ) : null}

      {status === "SETUP_PENDING" ? (
        <section className={styles.section} aria-labelledby="totp-enable-title">
          <h2 id="totp-enable-title"><Check aria-hidden="true" /> 인증 앱에서 확인</h2>
          {setupMaterial ? (
            <div className={styles.secretBox}>
              <p className={styles.oneTime}>이 등록 키는 생성 응답에서 지금 한 번만 표시됩니다.</p>
              <label htmlFor="totp-manual-secret">수동 입력 키</label>
              <div className={styles.copyRow}>
                <code id="totp-manual-secret">{setupMaterial.manualSecret}</code>
                <button type="button" className={styles.secondary} onClick={() => copyValue(setupMaterial.manualSecret, "수동 입력 키")} disabled={busy}>
                  <Clipboard aria-hidden="true" /> 복사
                </button>
              </div>
              <label htmlFor="totp-provisioning-uri">인증 앱 등록 URI</label>
              <textarea id="totp-provisioning-uri" readOnly value={setupMaterial.provisioningUri} rows={4} />
              <button type="button" className={styles.secondary} onClick={() => copyValue(setupMaterial.provisioningUri, "등록 URI")} disabled={busy}>
                <Clipboard aria-hidden="true" /> 등록 URI 복사
              </button>
            </div>
          ) : (
            <p className={styles.notice}>
              비밀키는 다시 표시되지 않습니다. 인증 앱에 저장하지 못했다면 등록 시도를 취소하고 새 키를 만드세요.
            </p>
          )}

          <form className={styles.codeForm} onSubmit={(event) => submitCode(event, "enable")}>
            <label htmlFor="totp-enable-code">인증 앱의 현재 6자리 코드</label>
            <input id="totp-enable-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required disabled={busy} />
            <button type="submit" disabled={busy}>
              {pendingAction?.includes("enable") ? <LoaderCircle className={styles.spin} aria-hidden="true" /> : <Check aria-hidden="true" />}
              활성화하고 모든 세션 종료
            </button>
          </form>

          <button type="button" className={styles.dangerGhost} onClick={cancelSetup} disabled={busy}>
            <RotateCcw aria-hidden="true" /> 등록 시도 취소
          </button>
        </section>
      ) : null}

      {status === "ENABLED" ? (
        <section className={styles.section} aria-labelledby="totp-disable-title">
          <h2 id="totp-disable-title"><ShieldOff aria-hidden="true" /> 2단계 인증 해제</h2>
          <p>현재 인증 앱 코드를 다시 확인한 뒤 자격증명을 삭제하고 이 계정의 모든 세션을 종료합니다.</p>
          <form className={styles.codeForm} onSubmit={(event) => submitCode(event, "disable")}>
            <label htmlFor="totp-disable-code">새로 표시된 6자리 코드</label>
            <input id="totp-disable-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required disabled={busy} />
            <button type="submit" className={styles.danger} disabled={busy}>
              {pendingAction?.includes("disable") ? <LoaderCircle className={styles.spin} aria-hidden="true" /> : <ShieldOff aria-hidden="true" />}
              해제하고 모든 세션 종료
            </button>
          </form>
        </section>
      ) : null}

      {message ? <p className={styles.success} role="status">{message}</p> : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
    </div>
  );
}
