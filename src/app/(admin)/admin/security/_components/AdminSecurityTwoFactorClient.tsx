"use client";

import { useEffect, useMemo, useState } from "react";

type TwoFactorStatus = {
  ok: boolean;
  enabled?: boolean;
  enabledAt?: string | null;
  setupPending?: boolean;
  message?: string;
};

type TwoFactorSetup = {
  ok: boolean;
  secret?: string;
  otpauthUrl?: string;
  message?: string;
};

const authenticatorLinks = [
  {
    label: "Google Authenticator Android",
    href: "https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2",
  },
  {
    label: "Google Authenticator iPhone",
    href: "https://apps.apple.com/app/google-authenticator/id388497605",
  },
  {
    label: "Microsoft Authenticator",
    href: "https://www.microsoft.com/security/mobile-authenticator-app",
  },
];

function normalizeCode(value: string) {
  return value.replace(/\D/g, "").slice(0, 6);
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function buildQrImageUrl(otpauthUrl?: string) {
  if (!otpauthUrl) return null;
  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(otpauthUrl)}`;
}

export default function AdminSecurityTwoFactorClient() {
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [code, setCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const qrImageUrl = useMemo(() => buildQrImageUrl(setup?.otpauthUrl), [setup?.otpauthUrl]);

  async function readJson<T>(response: Response): Promise<T> {
    const data = (await response.json().catch(() => ({}))) as T;
    if (!response.ok) {
      const fallback = `요청 실패: HTTP ${response.status}`;
      throw new Error((data as { message?: string })?.message || fallback);
    }
    return data;
  }

  async function loadStatus() {
    setError(null);
    const response = await fetch("/api/admin/2fa/status", { cache: "no-store" });
    const data = await readJson<TwoFactorStatus>(response);
    setStatus(data);
  }

  useEffect(() => {
    loadStatus().catch((err) => setError(err instanceof Error ? err.message : "2단계 인증 상태를 불러오지 못했습니다."));
  }, []);

  async function startSetup() {
    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/admin/2fa/setup", { method: "POST" });
      const data = await readJson<TwoFactorSetup>(response);
      setSetup(data);
      await loadStatus();
      setMessage("인증앱에 QR 코드 또는 설정 키를 등록한 뒤 6자리 코드를 입력하세요.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "2단계 인증 설정을 생성하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function enableTwoFactor() {
    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      const normalized = normalizeCode(code);
      if (normalized.length !== 6) {
        throw new Error("인증앱에 표시된 6자리 숫자를 입력하세요.");
      }

      const response = await fetch("/api/admin/2fa/enable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: normalized }),
      });

      await readJson(response);
      setCode("");
      setSetup(null);
      await loadStatus();
      setMessage("2단계 인증이 활성화되었습니다. 다음 로그인부터 인증코드가 필요합니다.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "2단계 인증 활성화에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function disableTwoFactor() {
    if (!confirm("2단계 인증을 해제하시겠습니까? 관리자 계정 보안이 약해집니다.")) return;

    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      const normalized = normalizeCode(disableCode);
      if (status?.enabled && normalized.length !== 6) {
        throw new Error("해제하려면 현재 인증앱의 6자리 코드를 입력하세요.");
      }

      const response = await fetch("/api/admin/2fa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: normalized }),
      });

      await readJson(response);
      setDisableCode("");
      setSetup(null);
      await loadStatus();
      setMessage("2단계 인증이 해제되었습니다.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "2단계 인증 해제에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function copy(value?: string) {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setMessage("복사되었습니다.");
  }

  return (
    <main className="securityPage">
      <header className="securityHero">
        <div>
          <p className="eyebrow">SECURITY</p>
          <h1>관리자 보안 설정</h1>
          <p className="heroText">관리자 계정별 2단계 인증을 설정합니다. 각 관리자는 본인 계정으로 로그인한 뒤 본인 인증앱에 별도로 등록해야 합니다.</p>
        </div>
        <div className={status?.enabled ? "statusPill statusOn" : "statusPill statusOff"}>
          {status ? (status.enabled ? "2FA 활성화" : "2FA 비활성화") : "상태 확인 중"}
        </div>
      </header>

      {message ? <div className="notice success">{message}</div> : null}
      {error ? <div className="notice error">{error}</div> : null}

      <section className="securityGrid">
        <aside className="securityCard compactCard">
          <div className="cardTitleRow">
            <h2>현재 상태</h2>
          </div>
          <div className="stateList">
            <div className="stateItem">
              <span>2단계 인증</span>
              <strong className={status?.enabled ? "good" : "warn"}>{status ? (status.enabled ? "활성화" : "비활성화") : "확인 중"}</strong>
            </div>
            <div className="stateItem">
              <span>등록일</span>
              <strong>{formatDate(status?.enabledAt)}</strong>
            </div>
            <div className="stateItem">
              <span>설정 진행</span>
              <strong>{status?.setupPending ? "진행 중" : "없음"}</strong>
            </div>
          </div>

          <div className="infoBox">
            <strong>관리자별 등록 원칙</strong>
            <p>현재 등록한 인증코드는 현재 로그인한 관리자 계정에만 적용됩니다. 다른 관리자는 각자 본인 계정으로 로그인해 별도로 등록해야 합니다.</p>
          </div>
        </aside>

        <section className="securityCard setupCard">
          <div className="cardTitleRow">
            <h2>본인 인증앱 등록</h2>
            <span>3단계</span>
          </div>

          <div className="steps">
            <div className="stepBlock">
              <div className="stepBadge">1</div>
              <div className="stepBody">
                <h3>인증앱 설치</h3>
                <p>Google Authenticator 또는 Microsoft Authenticator를 설치합니다.</p>
                <div className="linkButtons">
                  {authenticatorLinks.map((link) => (
                    <a key={link.href} href={link.href} target="_blank" rel="noreferrer">
                      {link.label}
                    </a>
                  ))}
                </div>
              </div>
            </div>

            <div className="stepBlock">
              <div className="stepBadge">2</div>
              <div className="stepBody">
                <h3>QR 코드 또는 설정 키 생성</h3>
                <p>버튼을 눌러 현재 계정 전용 등록 정보를 생성합니다.</p>
                <button type="button" onClick={startSetup} disabled={loading || status?.enabled} className="primaryButton">
                  {status?.setupPending ? "설정 정보 다시 보기" : "2단계 인증 등록 시작"}
                </button>

                {setup?.ok ? (
                  <div className="setupResult">
                    <div className="qrBox">
                      {qrImageUrl ? <img src={qrImageUrl} alt="2단계 인증 QR 코드" width={220} height={220} /> : <span>QR 코드 없음</span>}
                    </div>
                    <div className="setupFields">
                      <label>
                        <span>설정 키</span>
                        <code>{setup.secret}</code>
                      </label>
                      <button type="button" onClick={() => copy(setup.secret)} className="ghostButton">설정 키 복사</button>
                      <details>
                        <summary>otpauth URL 보기</summary>
                        <code className="urlCode">{setup.otpauthUrl}</code>
                        <button type="button" onClick={() => copy(setup.otpauthUrl)} className="ghostButton small">URL 복사</button>
                      </details>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="stepBlock">
              <div className="stepBadge">3</div>
              <div className="stepBody">
                <h3>6자리 코드 입력</h3>
                <p>인증앱에 표시된 6자리 숫자를 입력한 뒤 등록을 완료합니다.</p>
                <div className="actionRow">
                  <input value={code} onChange={(event) => setCode(normalizeCode(event.target.value))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" className="codeInput" />
                  <button type="button" onClick={enableTwoFactor} disabled={loading || status?.enabled || code.length !== 6} className="confirmButton">
                    등록 완료
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </section>

      <section className="dangerCard">
        <div>
          <h2>2단계 인증 해제</h2>
          <p>휴대폰 교체 또는 인증앱 재등록이 필요한 경우에만 사용하세요. 해제 후에는 다시 등록해야 합니다.</p>
        </div>
        <div className="actionRow dangerRow">
          <input value={disableCode} onChange={(event) => setDisableCode(normalizeCode(event.target.value))} inputMode="numeric" autoComplete="one-time-code" placeholder="현재 6자리 코드" className="codeInput" />
          <button type="button" onClick={disableTwoFactor} disabled={loading || !status?.enabled || disableCode.length !== 6} className="dangerButton">
            2단계 인증 해제
          </button>
        </div>
      </section>

      <style jsx>{`
        .securityPage {
          width: min(1180px, calc(100vw - 48px));
          margin: 0 auto;
          padding: 34px 0 54px;
          color: #eef7ff;
        }

        .securityHero,
        .securityCard,
        .dangerCard,
        .notice {
          border: 1px solid rgba(125, 211, 252, 0.18);
          background: linear-gradient(135deg, rgba(7, 13, 29, 0.9), rgba(9, 22, 41, 0.78));
          box-shadow: 0 18px 60px rgba(0, 0, 0, 0.36);
          backdrop-filter: blur(12px);
        }

        .securityHero {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 22px;
          border-radius: 24px;
          padding: 28px;
          margin-bottom: 18px;
        }

        .eyebrow {
          margin: 0 0 10px;
          color: #67e8f9;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.24em;
        }

        h1, h2, h3, p { margin-top: 0; }

        h1 {
          margin-bottom: 12px;
          font-size: clamp(28px, 3vw, 42px);
          line-height: 1.1;
          letter-spacing: -0.04em;
        }

        h2 { margin-bottom: 0; font-size: 22px; }
        h3 { margin-bottom: 8px; font-size: 16px; }

        .heroText {
          max-width: 760px;
          margin-bottom: 0;
          color: #cbd5e1;
          line-height: 1.7;
          font-size: 14px;
        }

        .statusPill {
          flex: 0 0 auto;
          border-radius: 999px;
          padding: 10px 14px;
          font-size: 13px;
          font-weight: 800;
        }
        .statusOn { color: #86efac; background: rgba(22, 163, 74, 0.16); border: 1px solid rgba(134, 239, 172, 0.3); }
        .statusOff { color: #fde68a; background: rgba(245, 158, 11, 0.16); border: 1px solid rgba(253, 230, 138, 0.3); }

        .notice {
          border-radius: 18px;
          padding: 14px 18px;
          margin-bottom: 14px;
          font-size: 14px;
        }
        .notice.success { color: #bbf7d0; border-color: rgba(74, 222, 128, 0.32); }
        .notice.error { color: #fecaca; border-color: rgba(248, 113, 113, 0.34); }

        .securityGrid {
          display: grid;
          grid-template-columns: minmax(280px, 0.8fr) minmax(0, 1.4fr);
          gap: 18px;
          align-items: start;
        }

        .securityCard, .dangerCard {
          border-radius: 24px;
          padding: 24px;
        }

        .cardTitleRow {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 18px;
        }
        .cardTitleRow span {
          color: #67e8f9;
          font-size: 12px;
          font-weight: 800;
        }

        .stateList { display: grid; gap: 10px; }
        .stateItem {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          border-radius: 16px;
          background: rgba(255,255,255,0.06);
          padding: 13px 14px;
          font-size: 14px;
        }
        .stateItem span { color: #94a3b8; }
        .stateItem strong { color: #f8fafc; }
        .good { color: #86efac !important; }
        .warn { color: #fde68a !important; }

        .infoBox {
          margin-top: 18px;
          border-radius: 18px;
          background: rgba(2, 6, 23, 0.52);
          border: 1px solid rgba(255,255,255,0.08);
          padding: 16px;
          color: #cbd5e1;
          font-size: 13px;
          line-height: 1.7;
        }
        .infoBox p { margin: 8px 0 0; }

        .steps { display: grid; gap: 14px; }
        .stepBlock {
          display: grid;
          grid-template-columns: 34px minmax(0, 1fr);
          gap: 14px;
          border-radius: 18px;
          background: rgba(255,255,255,0.055);
          border: 1px solid rgba(255,255,255,0.08);
          padding: 16px;
        }
        .stepBadge {
          display: grid;
          place-items: center;
          width: 34px;
          height: 34px;
          border-radius: 12px;
          background: rgba(34, 211, 238, 0.16);
          color: #67e8f9;
          font-weight: 900;
        }
        .stepBody p {
          margin-bottom: 12px;
          color: #cbd5e1;
          font-size: 13px;
          line-height: 1.65;
        }

        .linkButtons,
        .actionRow {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          align-items: center;
        }
        .linkButtons a,
        .ghostButton {
          border: 1px solid rgba(125, 211, 252, 0.28);
          border-radius: 999px;
          color: #cffafe;
          background: rgba(8, 145, 178, 0.1);
          padding: 8px 12px;
          font-size: 12px;
          text-decoration: none;
        }
        .linkButtons a:hover,
        .ghostButton:hover { background: rgba(8, 145, 178, 0.2); }

        button {
          border: 0;
          cursor: pointer;
          transition: opacity .15s ease, transform .15s ease, background .15s ease;
        }
        button:hover:not(:disabled) { transform: translateY(-1px); }
        button:disabled { cursor: not-allowed; opacity: 0.45; }

        .primaryButton,
        .confirmButton,
        .dangerButton {
          border-radius: 14px;
          padding: 11px 16px;
          font-size: 14px;
          font-weight: 900;
        }
        .primaryButton { background: #22d3ee; color: #03151d; }
        .confirmButton { background: #34d399; color: #04130c; }
        .dangerButton { background: #fb7185; color: #19070b; }
        .ghostButton.small { margin-top: 8px; }

        .setupResult {
          display: grid;
          grid-template-columns: 244px minmax(0, 1fr);
          gap: 16px;
          margin-top: 16px;
          align-items: start;
        }
        .qrBox {
          display: grid;
          place-items: center;
          min-height: 244px;
          border-radius: 20px;
          background: #fff;
          color: #0f172a;
          padding: 12px;
        }
        .qrBox img { display: block; max-width: 100%; height: auto; }

        .setupFields { display: grid; gap: 10px; min-width: 0; }
        label span,
        details summary {
          display: block;
          margin-bottom: 8px;
          color: #67e8f9;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.16em;
          text-transform: uppercase;
        }
        code {
          display: block;
          max-width: 100%;
          overflow-wrap: anywhere;
          border-radius: 14px;
          background: rgba(2, 6, 23, 0.62);
          border: 1px solid rgba(255,255,255,0.08);
          color: #e0f2fe;
          padding: 12px;
          font-size: 12px;
          line-height: 1.55;
        }
        details { color: #cbd5e1; }
        summary { cursor: pointer; }
        .urlCode { margin-bottom: 8px; max-height: 88px; overflow: auto; }

        .codeInput {
          width: 180px;
          max-width: 100%;
          border: 1px solid rgba(125, 211, 252, 0.18);
          border-radius: 14px;
          background: rgba(2, 6, 23, 0.72);
          color: #f8fafc;
          padding: 12px 14px;
          text-align: center;
          font-size: 18px;
          font-weight: 800;
          letter-spacing: 0.28em;
          outline: none;
        }
        .codeInput:focus { border-color: rgba(103, 232, 249, 0.8); box-shadow: 0 0 0 3px rgba(34,211,238,0.12); }

        .dangerCard {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          margin-top: 18px;
          border-color: rgba(251, 113, 133, 0.24);
          background: linear-gradient(135deg, rgba(69, 10, 10, 0.52), rgba(9, 22, 41, 0.78));
        }
        .dangerCard p {
          margin: 8px 0 0;
          color: #fecaca;
          font-size: 13px;
          line-height: 1.65;
        }
        .dangerRow { flex: 0 0 auto; justify-content: flex-end; }

        @media (max-width: 980px) {
          .securityPage { width: min(100% - 28px, 760px); padding-top: 22px; }
          .securityHero,
          .securityGrid,
          .dangerCard { display: block; }
          .securityCard + .securityCard { margin-top: 14px; }
          .statusPill { display: inline-block; margin-top: 18px; }
          .setupResult { grid-template-columns: 1fr; }
          .qrBox { min-height: 220px; }
          .dangerRow { justify-content: flex-start; margin-top: 16px; }
        }

        @media (max-width: 560px) {
          .securityPage { width: calc(100% - 20px); padding-bottom: 32px; }
          .securityHero,
          .securityCard,
          .dangerCard { border-radius: 18px; padding: 18px; }
          .stepBlock { grid-template-columns: 1fr; }
          .stepBadge { width: 30px; height: 30px; border-radius: 10px; }
          .actionRow { display: grid; grid-template-columns: 1fr; }
          .codeInput { width: 100%; }
          .primaryButton,
          .confirmButton,
          .dangerButton { width: 100%; }
        }
      `}</style>
    </main>
  );
}
