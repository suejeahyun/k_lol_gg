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
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 text-slate-100">
      <header className="rounded-3xl border border-cyan-400/20 bg-slate-950/70 p-6 shadow-2xl shadow-cyan-950/20">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300">Security</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">관리자 보안 설정</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
          관리자 계정별 2단계 인증을 설정합니다. 각 관리자는 본인 계정으로 로그인한 뒤 본인 인증앱에 별도로 등록해야 합니다.
        </p>
      </header>

      {message ? <div className="rounded-2xl border border-emerald-400/30 bg-emerald-950/30 p-4 text-sm text-emerald-100">{message}</div> : null}
      {error ? <div className="rounded-2xl border border-red-400/30 bg-red-950/30 p-4 text-sm text-red-100">{error}</div> : null}

      <section className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-6">
          <h2 className="text-xl font-semibold">현재 상태</h2>
          <div className="mt-5 space-y-4 text-sm">
            <div className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
              <span className="text-slate-300">2단계 인증</span>
              <span className={status?.enabled ? "font-semibold text-emerald-300" : "font-semibold text-amber-300"}>
                {status ? (status.enabled ? "활성화" : "비활성화") : "확인 중"}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
              <span className="text-slate-300">등록일</span>
              <span className="text-slate-100">{formatDate(status?.enabledAt)}</span>
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
              <span className="text-slate-300">설정 진행 중</span>
              <span className="text-slate-100">{status?.setupPending ? "예" : "아니오"}</span>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-slate-300">
            <p className="font-semibold text-slate-100">관리자별 등록 원칙</p>
            <p className="mt-2">지금 등록한 인증코드는 현재 로그인한 관리자 계정에만 적용됩니다. 다른 관리자는 각자 본인 계정으로 로그인해 별도로 등록해야 합니다.</p>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-6">
          <h2 className="text-xl font-semibold">본인 인증앱 등록</h2>

          <ol className="mt-5 space-y-5 text-sm leading-6 text-slate-300">
            <li className="rounded-2xl bg-white/5 p-4">
              <p className="font-semibold text-slate-100">1. 인증앱 설치</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {authenticatorLinks.map((link) => (
                  <a key={link.href} href={link.href} target="_blank" rel="noreferrer" className="rounded-full border border-cyan-300/30 px-3 py-1.5 text-xs text-cyan-100 hover:bg-cyan-300/10">
                    {link.label}
                  </a>
                ))}
              </div>
            </li>

            <li className="rounded-2xl bg-white/5 p-4">
              <p className="font-semibold text-slate-100">2. QR 코드 또는 설정 키 생성</p>
              <button
                type="button"
                onClick={startSetup}
                disabled={loading || status?.enabled}
                className="mt-3 rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {status?.setupPending ? "설정 정보 다시 보기" : "2단계 인증 등록 시작"}
              </button>

              {setup?.ok ? (
                <div className="mt-5 grid gap-4 md:grid-cols-[240px_1fr]">
                  <div className="flex min-h-[240px] items-center justify-center rounded-2xl bg-white p-3">
                    {qrImageUrl ? <img src={qrImageUrl} alt="2단계 인증 QR 코드" width={220} height={220} /> : <span className="text-slate-900">QR 코드 없음</span>}
                  </div>
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">설정 키</p>
                      <div className="mt-2 rounded-xl bg-black/30 p-3 font-mono text-xs break-all text-slate-100">{setup.secret}</div>
                      <button type="button" onClick={() => copy(setup.secret)} className="mt-2 rounded-lg border border-white/15 px-3 py-1.5 text-xs text-slate-100 hover:bg-white/10">설정 키 복사</button>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">otpauth URL</p>
                      <div className="mt-2 max-h-24 overflow-auto rounded-xl bg-black/30 p-3 font-mono text-xs break-all text-slate-100">{setup.otpauthUrl}</div>
                      <button type="button" onClick={() => copy(setup.otpauthUrl)} className="mt-2 rounded-lg border border-white/15 px-3 py-1.5 text-xs text-slate-100 hover:bg-white/10">URL 복사</button>
                    </div>
                  </div>
                </div>
              ) : null}
            </li>

            <li className="rounded-2xl bg-white/5 p-4">
              <p className="font-semibold text-slate-100">3. 앱에 표시된 6자리 코드 입력</p>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                <input
                  value={code}
                  onChange={(event) => setCode(normalizeCode(event.target.value))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="6자리 코드"
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-center text-lg tracking-[0.35em] text-slate-100 outline-none focus:border-cyan-300 sm:max-w-56"
                />
                <button
                  type="button"
                  onClick={enableTwoFactor}
                  disabled={loading || status?.enabled || code.length !== 6}
                  className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  등록 완료
                </button>
              </div>
            </li>
          </ol>
        </div>
      </section>

      <section className="rounded-3xl border border-red-400/20 bg-red-950/20 p-6">
        <h2 className="text-xl font-semibold text-red-100">2단계 인증 해제</h2>
        <p className="mt-2 text-sm leading-6 text-red-100/80">휴대폰을 교체하거나 인증앱을 재등록해야 할 때만 사용하세요. 해제 후에는 다시 등록해야 합니다.</p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            value={disableCode}
            onChange={(event) => setDisableCode(normalizeCode(event.target.value))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="현재 6자리 코드"
            className="w-full rounded-xl border border-red-300/20 bg-black/30 px-4 py-3 text-center text-lg tracking-[0.35em] text-slate-100 outline-none focus:border-red-300 sm:max-w-56"
          />
          <button
            type="button"
            onClick={disableTwoFactor}
            disabled={loading || !status?.enabled || disableCode.length !== 6}
            className="rounded-xl bg-red-400 px-4 py-3 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
          >
            2단계 인증 해제
          </button>
        </div>
      </section>
    </main>
  );
}
