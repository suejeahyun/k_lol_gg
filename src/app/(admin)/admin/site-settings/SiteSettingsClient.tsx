"use client";

import { FormEvent, useState } from "react";
import type { SiteSettings, SitePlanStatus, SiteThemePreset } from "@/lib/site/settings";

type SaveState = "idle" | "saving" | "saved" | "error";

type SiteSettingsClientProps = {
  initialSettings: SiteSettings;
};

export default function SiteSettingsClient({ initialSettings }: SiteSettingsClientProps) {
  const [settings, setSettings] = useState<SiteSettings>(initialSettings);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [message, setMessage] = useState("");

  function update<K extends keyof SiteSettings>(key: K, value: SiteSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
    setSaveState("idle");
    setMessage("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveState("saving");
    setMessage("");

    try {
      const response = await fetch("/api/admin/site-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result?.message || "저장하지 못했습니다.");
      }

      setSettings(result.settings);
      setSaveState("saved");
      setMessage("사이트 설정을 저장했습니다.");
    } catch (error) {
      setSaveState("error");
      setMessage(error instanceof Error ? error.message : "저장 중 오류가 발생했습니다.");
    }
  }

  return (
    <form className="admin-card site-settings-form" onSubmit={handleSubmit}>
      <div className="site-settings-status-strip" aria-label="현재 사이트 운영 상태">
        <div>
          <span>운영 사이트</span>
          <strong>{settings.siteName}</strong>
        </div>
        <div>
          <span>오픈채팅방</span>
          <strong>{settings.roomName || "방 이름 미설정"}</strong>
        </div>
        <div data-state={settings.planStatus === "ACTIVE" ? "active" : "locked"}>
          <span>유료 상태</span>
          <strong>{settings.planStatus === "ACTIVE" ? "활성" : "잠금"}</strong>
        </div>
        <div>
          <span>기본 테마</span>
          <strong>{settings.themePreset === "black-gold" ? "블랙 골드" : settings.themePreset === "neon-cyber" ? "네온" : "다크모던"}</strong>
        </div>
      </div>

      <div className="site-settings-grid">
        <label className="site-settings-field">
          <span>사이트 이름</span>
          <input
            className="admin-input"
            value={settings.siteName}
            onChange={(event) => update("siteName", event.target.value)}
            placeholder="K-LOL.GG"
          />
        </label>

        <label className="site-settings-field">
          <span>사이트 한 줄 설명</span>
          <input
            className="admin-input"
            value={settings.siteTagline ?? ""}
            onChange={(event) => update("siteTagline", event.target.value || null)}
            placeholder="내전 · 랭킹 · AI 데이터"
          />
        </label>

        <label className="site-settings-field">
          <span>오픈채팅방 이름</span>
          <input
            className="admin-input"
            value={settings.roomName ?? ""}
            onChange={(event) => update("roomName", event.target.value || null)}
            placeholder="예: A방 내전"
          />
        </label>
      </div>

      <div className="site-settings-section-title">홈 화면 문구</div>

      <div className="site-settings-grid site-settings-grid--home">
        <label className="site-settings-field">
          <span>상단 라벨</span>
          <input
            className="admin-input"
            value={settings.homeEyebrow}
            onChange={(event) => update("homeEyebrow", event.target.value)}
            placeholder="KOREA LOL CUSTOM STATS"
          />
        </label>

        <label className="site-settings-field">
          <span>제목</span>
          <input
            className="admin-input"
            value={settings.homeHeroTitle}
            onChange={(event) => update("homeHeroTitle", event.target.value)}
            placeholder="실력을"
          />
        </label>

        <label className="site-settings-field">
          <span>제목 강조</span>
          <input
            className="admin-input"
            value={settings.homeHeroAccent}
            onChange={(event) => update("homeHeroAccent", event.target.value)}
            placeholder="증명하라"
          />
        </label>

        <label className="site-settings-field">
          <span>첫 번째 버튼 문구</span>
          <input
            className="admin-input"
            value={settings.homePrimaryCtaLabel}
            onChange={(event) => update("homePrimaryCtaLabel", event.target.value)}
            placeholder="내전 보러가기"
          />
        </label>

        <label className="site-settings-field">
          <span>첫 번째 버튼 경로</span>
          <input
            className="admin-input"
            value={settings.homePrimaryCtaHref}
            onChange={(event) => update("homePrimaryCtaHref", event.target.value)}
            placeholder="/matches"
          />
        </label>

        <label className="site-settings-field">
          <span>두 번째 버튼 문구</span>
          <input
            className="admin-input"
            value={settings.homeSecondaryCtaLabel}
            onChange={(event) => update("homeSecondaryCtaLabel", event.target.value)}
            placeholder="플레이어 검색"
          />
        </label>

        <label className="site-settings-field">
          <span>두 번째 버튼 경로</span>
          <input
            className="admin-input"
            value={settings.homeSecondaryCtaHref}
            onChange={(event) => update("homeSecondaryCtaHref", event.target.value)}
            placeholder="/players"
          />
        </label>

        <label className="site-settings-field site-settings-field--wide">
          <span>홈 설명</span>
          <textarea
            className="admin-input site-settings-textarea site-settings-textarea--compact"
            value={settings.homeHeroDescription}
            onChange={(event) => update("homeHeroDescription", event.target.value)}
          />
        </label>
      </div>

      <div className="site-settings-section-title">운영 표시</div>

      <div className="site-settings-grid">
        <label className="site-settings-field">
          <span>유저 AI 비서 이름</span>
          <input
            className="admin-input"
            value={settings.userAssistantName}
            onChange={(event) => update("userAssistantName", event.target.value)}
            placeholder="K-LOL 코치"
          />
        </label>

        <label className="site-settings-field">
          <span>관리자 AI 비서 이름</span>
          <input
            className="admin-input"
            value={settings.adminAssistantName}
            onChange={(event) => update("adminAssistantName", event.target.value)}
            placeholder="AI 운영 비서"
          />
        </label>

        <label className="site-settings-field">
          <span>기본 테마</span>
          <select
            className="admin-input"
            value={settings.themePreset}
            onChange={(event) => update("themePreset", event.target.value as SiteThemePreset)}
          >
            <option value="dark-modern">다크모던 블루</option>
            <option value="neon-cyber">네온 사이버</option>
            <option value="black-gold">블랙 골드</option>
          </select>
        </label>

        <label className="site-settings-field">
          <span>유료 상태</span>
          <select
            className="admin-input"
            value={settings.planStatus}
            onChange={(event) => update("planStatus", event.target.value as SitePlanStatus)}
          >
            <option value="ACTIVE">유료 활성화</option>
            <option value="LOCKED">유료 잠금</option>
          </select>
        </label>

        <label className="site-settings-field">
          <span>문의처</span>
          <input
            className="admin-input"
            value={settings.supportContact ?? ""}
            onChange={(event) => update("supportContact", event.target.value || null)}
            placeholder="카카오톡 ID 또는 관리자 연락처"
          />
        </label>

        <label className="site-settings-field">
          <span>결제/계약 담당</span>
          <input
            className="admin-input"
            value={settings.billingOwner ?? ""}
            onChange={(event) => update("billingOwner", event.target.value || null)}
            placeholder="예: A방 운영자"
          />
        </label>

        <label className="site-settings-field">
          <span>체험 종료일</span>
          <input
            className="admin-input"
            type="date"
            value={settings.trialEndsAt ?? ""}
            onChange={(event) => update("trialEndsAt", event.target.value || null)}
          />
        </label>
      </div>

      <div className="site-settings-grid site-settings-grid--visual">
        <label className="site-settings-field">
          <span>사이트 로고 URL</span>
          <input
            className="admin-input"
            value={settings.siteLogoUrl ?? ""}
            onChange={(event) => update("siteLogoUrl", event.target.value || null)}
            placeholder="/images/logo.png 또는 https://..."
          />
        </label>

        <label className="site-settings-field">
          <span>카카오 오픈채팅 URL</span>
          <input
            className="admin-input"
            value={settings.kakaoOpenChatUrl ?? ""}
            onChange={(event) => update("kakaoOpenChatUrl", event.target.value || null)}
            placeholder="https://open.kakao.com/..."
          />
        </label>

        <label className="site-settings-field">
          <span>페이지 배경 URL</span>
          <input
            className="admin-input"
            value={settings.homeBackgroundUrl ?? ""}
            onChange={(event) => update("homeBackgroundUrl", event.target.value || null)}
            placeholder="/images/theme/dark-modern/klol-global-stage-v1.png"
          />
        </label>
      </div>

      <section className="site-settings-switches" aria-label="기능 오픈 설정">
        <label>
          <input
            type="checkbox"
            checked={settings.kakaoEnabled}
            onChange={(event) => update("kakaoEnabled", event.target.checked)}
          />
          <span>카카오톡 운영 기능</span>
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.recruitEnabled}
            onChange={(event) => update("recruitEnabled", event.target.checked)}
          />
          <span>구인현황 기능</span>
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.balanceAiEnabled}
            onChange={(event) => update("balanceAiEnabled", event.target.checked)}
          />
          <span>K-LOL 랭킹 / AI 밸런스 기능</span>
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.randomTeamEnabled}
            onChange={(event) => update("randomTeamEnabled", event.target.checked)}
          />
          <span>랜덤 팀 나누기 기능</span>
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.riotEnabled}
            onChange={(event) => update("riotEnabled", event.target.checked)}
          />
          <span>Riot 연동 / 솔랭 관리 기능</span>
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.aiAssistantEnabled}
            onChange={(event) => update("aiAssistantEnabled", event.target.checked)}
          />
          <span>AI 운영 비서 기능</span>
        </label>
      </section>

      <div className="site-settings-grid site-settings-grid--notice">
        <label className="site-settings-field">
          <span>잠금 제목</span>
          <input
            className="admin-input"
            value={settings.premiumNoticeTitle}
            onChange={(event) => update("premiumNoticeTitle", event.target.value)}
          />
        </label>

        <label className="site-settings-field site-settings-field--wide">
          <span>잠금 안내 문구</span>
          <textarea
            className="admin-input site-settings-textarea"
            value={settings.premiumNoticeMessage}
            onChange={(event) => update("premiumNoticeMessage", event.target.value)}
          />
        </label>

        <label className="site-settings-field site-settings-field--wide">
          <span>슈퍼어드민 운영 메모</span>
          <textarea
            className="admin-input site-settings-textarea"
            value={settings.premiumMemo ?? ""}
            onChange={(event) => update("premiumMemo", event.target.value || null)}
            placeholder="방별 계약 조건, 열어둘 기능, 다음 점검일 등을 기록합니다."
          />
        </label>
      </div>

      <div className="site-settings-footer">
        {message ? (
          <p className={`site-settings-message site-settings-message--${saveState}`}>
            {message}
          </p>
        ) : (
          <p className="site-settings-message">저장 후 각 페이지의 잠금 상태가 즉시 반영됩니다.</p>
        )}
        <button className="admin-button admin-button--primary" type="submit" disabled={saveState === "saving"}>
          {saveState === "saving" ? "저장 중..." : "설정 저장"}
        </button>
      </div>
    </form>
  );
}
