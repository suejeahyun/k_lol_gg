"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, RotateCcw, Save, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AdminPlayer } from "@/modules/players/domain/admin-player";

import styles from "./admin-players.module.css";

type FormValues = {
  memberName: string;
  nickname: string;
  tagLine: string;
  legacyId: string;
  peakTier: string;
  currentTier: string;
};

type ProblemBody = { code?: unknown; detail?: unknown; title?: unknown };

function initialValues(player?: AdminPlayer): FormValues {
  return {
    memberName: player?.memberName ?? "",
    nickname: player?.nickname ?? "",
    tagLine: player?.tagLine ?? "",
    legacyId: player?.legacyId?.toString() ?? "",
    peakTier: player?.peakTier ?? "",
    currentTier: player?.currentTier ?? "",
  };
}

function newIdempotencyKey() {
  return globalThis.crypto.randomUUID();
}

async function problemMessage(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as ProblemBody | null;
  if (body && typeof body.detail === "string") return body.detail;
  if (response.status === 403) return "이 작업을 수행할 관리자 권한이 없습니다.";
  if (response.status === 404) return "플레이어를 찾을 수 없습니다.";
  if (response.status === 409) return "중복된 플레이어 정보가 있습니다.";
  if (response.status === 412) return "다른 관리자가 먼저 수정했습니다. 최신 정보를 다시 확인해 주세요.";
  return "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

export function AdminPlayerForm({
  mode,
  player,
}: {
  mode: "create" | "edit";
  player?: AdminPlayer;
}) {
  const router = useRouter();
  const [values, setValues] = useState(() => initialValues(player));
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const retryKey = useRef<{ fingerprint: string; key: string } | null>(null);

  function setField(field: keyof FormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setMessage(null);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = {
      memberName: values.memberName.trim(),
      nickname: values.nickname.trim(),
      tagLine: values.tagLine.replace(/^#+/, "").trim(),
      legacyId: values.legacyId.trim() ? Number(values.legacyId) : null,
      peakTier: values.peakTier.trim() || null,
      currentTier: values.currentTier.trim() || null,
    };
    if (!payload.memberName || !payload.nickname || !payload.tagLine) {
      setMessage({ tone: "error", text: "회원명, 닉네임과 태그는 모두 필요합니다." });
      return;
    }

    const fingerprint = JSON.stringify({ mode, playerId: player?.id ?? null, revision: player?.revision ?? null, payload });
    if (!retryKey.current || retryKey.current.fingerprint !== fingerprint) {
      retryKey.current = { fingerprint, key: newIdempotencyKey() };
    }

    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(
        mode === "create" ? "/api/admin/players" : `/api/admin/players/${player?.id}`,
        {
          method: mode === "create" ? "POST" : "PATCH",
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Idempotency-Key": retryKey.current.key,
            ...(mode === "edit" ? { "If-Match": `"${player?.revision}"` } : {}),
          },
          body: JSON.stringify(payload),
        },
      );
      if (!response.ok) {
        setMessage({ tone: "error", text: await problemMessage(response) });
        if (response.status === 412 || response.status === 404) router.refresh();
        return;
      }

      const body = (await response.json()) as { message?: string; player?: { id?: string } };
      retryKey.current = null;
      setMessage({ tone: "success", text: body.message ?? "저장되었습니다." });
      if (mode === "create" && body.player?.id) {
        router.push(`/admin/players/${body.player.id}`);
      } else {
        router.refresh();
      }
    } catch {
      setMessage({ tone: "error", text: "네트워크 연결을 확인한 뒤 같은 내용으로 다시 시도해 주세요." });
    } finally {
      setPending(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={submit} aria-busy={pending}>
      <div className={styles.formGrid}>
        <label className={styles.field}>
          <span>회원명 <b>관리자 전용</b></span>
          <Input
            required
            maxLength={100}
            autoComplete="off"
            value={values.memberName}
            onChange={(event) => setField("memberName", event.target.value)}
          />
          <small>공개 목록과 공개 검색에는 포함되지 않습니다.</small>
        </label>
        <label className={styles.field}>
          <span>닉네임</span>
          <Input
            required
            maxLength={64}
            autoComplete="off"
            value={values.nickname}
            onChange={(event) => setField("nickname", event.target.value)}
          />
        </label>
        <label className={styles.field}>
          <span>태그</span>
          <Input
            required
            maxLength={32}
            autoComplete="off"
            placeholder="KLOL"
            value={values.tagLine}
            onChange={(event) => setField("tagLine", event.target.value)}
          />
          <small># 기호는 제외하고 입력합니다.</small>
        </label>
        <label className={styles.field}>
          <span>V1 기존 번호</span>
          <Input
            type="number"
            min={1}
            max={2147483647}
            inputMode="numeric"
            placeholder="선택 입력"
            value={values.legacyId}
            onChange={(event) => setField("legacyId", event.target.value)}
          />
          <small>이관 대상에게만 지정하며 다른 플레이어와 중복될 수 없습니다.</small>
        </label>
        <label className={styles.field}>
          <span>최고 티어</span>
          <Input
            maxLength={32}
            list="player-tier-examples"
            placeholder="예: 에메랄드 1"
            value={values.peakTier}
            onChange={(event) => setField("peakTier", event.target.value)}
          />
        </label>
        <label className={styles.field}>
          <span>현재 티어</span>
          <Input
            maxLength={32}
            list="player-tier-examples"
            placeholder="예: PLATINUM IV"
            value={values.currentTier}
            onChange={(event) => setField("currentTier", event.target.value)}
          />
        </label>
      </div>
      <datalist id="player-tier-examples">
        <option value="골드 1" />
        <option value="에메랄드 1" />
        <option value="마스터 3층" />
        <option value="PLATINUM IV" />
        <option value="DIAMOND II" />
      </datalist>

      <div className={styles.formActions}>
        <Button size="lg" type="submit" disabled={pending}>
          {mode === "create" ? <UserPlus aria-hidden="true" /> : <Save aria-hidden="true" />}
          {pending ? "저장 중…" : mode === "create" ? "플레이어 등록" : "변경 저장"}
        </Button>
      </div>
      <div className={styles.formMessage} data-tone={message?.tone ?? "idle"} aria-live="polite">
        {message ? <><AlertCircle aria-hidden="true" /> {message.text}</> : null}
      </div>
    </form>
  );
}

export function AdminPlayerDeactivate({ player }: { player: AdminPlayer }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const key = useRef<string | null>(null);

  async function deactivate() {
    key.current ??= newIdempotencyKey();
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/players/${player.id}`, {
        method: "DELETE",
        headers: {
          "Idempotency-Key": key.current,
          "If-Match": `"${player.revision}"`,
        },
      });
      if (!response.ok) {
        setMessage(await problemMessage(response));
        if (response.status === 412 || response.status === 404) router.refresh();
        return;
      }
      key.current = null;
      setConfirming(false);
      setMessage("비활성화했습니다. 기존 경기와 통계 식별자는 보존됩니다.");
      router.refresh();
    } catch {
      setMessage("연결을 확인한 뒤 다시 시도해 주세요.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className={styles.danger} aria-labelledby="player-deactivate-title">
      <div>
        <h2 id="player-deactivate-title">복구 가능한 비활성화</h2>
        <p>공개 목록에서만 제외하며 UUID, 기존 번호, 경기·통계 연결은 삭제하지 않습니다.</p>
      </div>
      {player.status === "INACTIVE" ? (
        <span className={styles.inactiveNotice}>이미 비활성 상태입니다.</span>
      ) : confirming ? (
        <div className={styles.confirmRow}>
          <strong>{player.nickname}#{player.tagLine}을 비활성화할까요?</strong>
          <Button variant="destructive" type="button" disabled={pending} onClick={deactivate}>
            {pending ? "처리 중…" : "비활성화 확인"}
          </Button>
          <Button variant="outline" type="button" disabled={pending} onClick={() => setConfirming(false)}>
            취소
          </Button>
        </div>
      ) : (
        <Button variant="destructive" type="button" onClick={() => setConfirming(true)}>
          비활성화 준비
        </Button>
      )}
      <p className={styles.inlineMessage} aria-live="polite">{message}</p>
    </section>
  );
}

export function AdminPlayerReactivate({ player }: { player: AdminPlayer }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const key = useRef<string | null>(null);

  async function reactivate() {
    key.current ??= newIdempotencyKey();
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/players/${player.id}/reactivate`, {
        method: "POST",
        headers: {
          "Idempotency-Key": key.current,
          "If-Match": `"${player.revision}"`,
        },
      });
      if (!response.ok) {
        setMessage(await problemMessage(response));
        if (response.status === 412 || response.status === 404) router.refresh();
        return;
      }
      key.current = null;
      setConfirming(false);
      setMessage("재활성화했습니다. 공개 검색과 V1 기존 번호 주소가 다시 연결됩니다.");
      router.refresh();
    } catch {
      setMessage("연결을 확인한 뒤 다시 시도해 주세요.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className={styles.recovery} aria-labelledby="player-reactivate-title">
      <div>
        <h2 id="player-reactivate-title">명시적 재활성화</h2>
        <p>보존된 UUID와 V1 기존 번호를 그대로 사용해 공개 목록·검색 연결을 복구합니다.</p>
      </div>
      {confirming ? (
        <div className={styles.confirmRow}>
          <strong>{player.nickname}#{player.tagLine}을 다시 공개할까요?</strong>
          <Button type="button" disabled={pending} onClick={reactivate}>
            <RotateCcw aria-hidden="true" />
            {pending ? "처리 중…" : "재활성화 확인"}
          </Button>
          <Button variant="outline" type="button" disabled={pending} onClick={() => setConfirming(false)}>
            취소
          </Button>
        </div>
      ) : (
        <Button type="button" onClick={() => setConfirming(true)}>
          <RotateCcw aria-hidden="true" /> 재활성화 준비
        </Button>
      )}
      <p className={styles.inlineMessage} aria-live="polite">{message}</p>
    </section>
  );
}
