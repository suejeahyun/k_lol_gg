"use client";

import { useEffect } from "react";
import type { SiteThemePreset } from "@/lib/site/settings";
import { loadPublicSiteSettings } from "@/lib/site/public-settings-client";

const allowedThemes: SiteThemePreset[] = ["dark-modern", "neon-cyber", "black-gold"];
const optimizedBuiltInImages: Record<string, string> = {
  "/images/theme/dark-modern/klol-global-stage-v1.png":
    "/images/theme/dark-modern/klol-global-stage-v1.webp",
};

function isTheme(value: unknown): value is SiteThemePreset {
  return typeof value === "string" && allowedThemes.includes(value as SiteThemePreset);
}

function safeCssUrl(value: string) {
  return value.replace(/["\\\n\r]/g, "");
}

export default function SiteRuntimeSettings() {
  useEffect(() => {
    let cancelled = false;

    async function applySettings() {
      try {
        const settings = await loadPublicSiteSettings();
        if (cancelled) return;

        const root = document.documentElement;

        if (settings.siteName) {
          root.style.setProperty("--site-name-length", String(settings.siteName.length));
          if (document.title.includes("K-LOL.GG")) {
            document.title = document.title.replaceAll("K-LOL.GG", settings.siteName);
          } else if (!document.title) {
            document.title = settings.siteTagline
              ? `${settings.siteName} | ${settings.siteTagline}`
              : settings.siteName;
          }
        }

        if (settings.homeBackgroundUrl) {
          const backgroundUrl = optimizedBuiltInImages[settings.homeBackgroundUrl]
            ?? settings.homeBackgroundUrl;
          root.style.setProperty("--site-background-image", `url("${safeCssUrl(backgroundUrl)}")`);
          root.dataset.siteBackground = "custom";
        } else {
          root.style.removeProperty("--site-background-image");
          delete root.dataset.siteBackground;
        }

        if (!window.localStorage.getItem("klol-theme") && isTheme(settings.themePreset)) {
          root.dataset.theme = settings.themePreset;
          root.style.colorScheme = "dark";
          window.dispatchEvent(new Event("klol-theme-change"));
        }
      } catch {
        // Runtime settings are progressive enhancement; the static theme remains usable.
      }
    }

    applySettings();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
