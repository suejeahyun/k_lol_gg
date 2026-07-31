import type { PublicSiteSettings } from "@/lib/site/settings";

type PublicSiteSettingsResponse = {
  settings?: PublicSiteSettings;
};

let settingsRequest: Promise<PublicSiteSettings> | null = null;

export function loadPublicSiteSettings() {
  if (!settingsRequest) {
    settingsRequest = fetch("/api/site-settings", { cache: "force-cache" })
      .then(async (response) => {
        if (!response.ok) throw new Error("사이트 설정을 불러오지 못했습니다.");
        const data = (await response.json()) as PublicSiteSettingsResponse;
        if (!data.settings) throw new Error("사이트 설정 응답이 비어 있습니다.");
        return data.settings;
      })
      .catch((error) => {
        settingsRequest = null;
        throw error;
      });
  }

  return settingsRequest;
}
