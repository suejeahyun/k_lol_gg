"use client";

import { useEffect } from "react";
import type { SiteThemePreset } from "@/lib/site/settings";

type PublicSiteSettings = {
  siteName?: string;
  homeBackgroundUrl?: string | null;
  themePreset?: SiteThemePreset;
};

const allowedThemes: SiteThemePreset[] = ["dark-modern", "neon-cyber", "black-gold"];

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
        const response = await fetch("/api/site-settings", { cache: "no-store" });
        if (!response.ok) return;

        const data = (await response.json()) as { settings?: PublicSiteSettings };
        if (cancelled || !data.settings) return;

        const root = document.documentElement;
        const settings = data.settings;

        if (settings.siteName) {
          root.style.setProperty("--site-name-length", String(settings.siteName.length));
        }

        if (settings.homeBackgroundUrl) {
          root.style.setProperty("--site-background-image", `url("${safeCssUrl(settings.homeBackgroundUrl)}")`);
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
