"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

type Player = {
  id: number;
  name: string;
  nickname: string;
  tag: string;
  peakTier: string | null;
  currentTier: string | null;
};

export default function MyPlayerPage() {
  const [player, setPlayer] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [nickname, setNickname] = useState("");
  const [tag, setTag] = useState("");

  const fetchPlayer = async () => {
    try {
      const res = await fetch("/api/my-player", {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.message || "내 정보 조회 실패");
        return;
      }

      setPlayer(data.player);

      if (data.player) {
        setNickname(data.player.nickname);
        setTag(data.player.tag);
      }
    } catch (error: unknown) {
      console.error("[MY_PLAYER_FETCH_ERROR]", error);
      alert("내 정보를 불러오는 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      setSaving(true);

      const res = await fetch("/api/my-player", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          nickname,
          tag,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.message || "수정 실패");
        return;
      }

      alert("플레이어 정보가 수정되었습니다. 티어는 Riot 동기화 후 자동 반영됩니다.");
      await fetchPlayer();
    } catch (error: unknown) {
      console.error("[MY_PLAYER_UPDATE_ERROR]", error);
      alert("수정 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    fetchPlayer().catch((error: unknown) => {
      console.error("[MY_PLAYER_FETCH_PROMISE_ERROR]", error);
    });
  }, []);

  if (loading) {
    return <div className="admin-empty">정보를 불러오는 중입니다.</div>;
  }

  if (!player) {
    return <div className="admin-empty">플레이어 정보가 없습니다.</div>;
  }

  return (
    <div className="admin-page my-player-page my-player-page--riot-auto">
      <div className="admin-page__header">
        <div>
          <p className="admin-page__kicker">MY PLAYER</p>
          <h1 className="admin-page__title">내 플레이어 정보</h1>
          <p className="admin-page__description">
            이름과 Riot ID를 확인합니다. 티어는 Riot API 솔랭 동기화 결과로 자동 적용됩니다.
          </p>
        </div>
        <div className="admin-dashboard-actions">
          <Link className="admin-button" href="/me/riot">Riot 연동</Link>
          <Link className="admin-button admin-button--ghost" href={`/players/${player.id}/riot`}>솔랭 분석</Link>
        </div>
      </div>

      <section className="admin-card my-player-riot-summary">
        <div>
          <span>플레이어</span>
          <strong>{player.name}</strong>
          <em>{player.nickname}#{player.tag}</em>
        </div>
        <div>
          <span>현재 티어</span>
          <strong>{player.currentTier || "Riot 동기화 필요"}</strong>
          <em>솔랭 스냅샷 기준</em>
        </div>
        <div>
          <span>최고 티어</span>
          <strong>{player.peakTier || "자동 보정 대기"}</strong>
          <em>현재 티어가 기존 최고보다 높으면 자동 갱신</em>
        </div>
      </section>

      <div className="my-player-two-column">
        <form className="admin-form my-player-form" onSubmit={handleSubmit}>
          <div className="admin-section-head">
            <div>
              <h2>Riot ID 확인</h2>
              <p className="admin-muted">검색과 연동에 사용할 닉네임과 태그만 수정합니다.</p>
            </div>
          </div>

          <label className="auth-field">
            <span>닉네임</span>
            <input value={nickname} onChange={(e) => setNickname(e.target.value)} />
          </label>

          <label className="auth-field">
            <span>태그</span>
            <input value={tag} onChange={(e) => setTag(e.target.value.replace(/^#/, ""))} />
          </label>

          <button className="auth-button my-player-form__submit" type="submit" disabled={saving}>
            {saving ? "저장 중..." : "닉네임#태그 저장"}
          </button>
        </form>

        <section className="admin-card account-tier-auto-card my-player-auto-tier-card">
          <p className="admin-page__kicker">AUTO TIER FLOW</p>
          <h2>수동 티어 입력은 사용하지 않습니다.</h2>
          <p>
            Riot 계정을 연결한 뒤 솔랭 동기화를 실행하면 현재 티어가 자동 갱신됩니다.
            팀 밸런스, 멸망전 참가자 분석, 플레이어 목록은 이 값을 우선 사용합니다.
          </p>
          <div className="account-tier-auto-card__steps">
            <span>Riot ID 검증</span>
            <span>솔랭 스냅샷 저장</span>
            <span>현재 티어 자동 적용</span>
          </div>
          <div className="account-tier-auto-card__actions">
            <Link className="admin-button" href="/me/riot">Riot 계정 연동</Link>
            <Link className="admin-button admin-button--ghost" href="/riot-api">Riot API 안내</Link>
          </div>
        </section>
      </div>
    </div>
  );
}
