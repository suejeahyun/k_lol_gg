"use client";

import { Palette } from "lucide-react";
import { useEffect, useMemo, useSyncExternalStore } from "react";

export type KlolTheme = "dark-modern" | "neon-cyber" | "black-gold";

const THEME_STORAGE_KEY = "klol-theme";

const themes: Array<{
  id: KlolTheme;
  label: string;
  shortLabel: string;
  description: string;
}> = [
  {
    id: "dark-modern",
    label: "다크",
    shortLabel: "다크",
    description: "다크모던 기본 테마",
  },
  {
    id: "neon-cyber",
    label: "네온",
    shortLabel: "네온",
    description: "네온 사이버 강조 테마",
  },
  {
    id: "black-gold",
    label: "골드",
    shortLabel: "골드",
    description: "블랙 골드 프리미엄 테마",
  },
];

function isKlolTheme(value: string | null): value is KlolTheme {
  return Boolean(value && themes.some((theme) => theme.id === value));
}

function applyTheme(theme: KlolTheme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = "dark";
}

function readStoredTheme(): KlolTheme {
  if (typeof window === "undefined") {
    return "dark-modern";
  }

  const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (isKlolTheme(savedTheme)) return savedTheme;

  const runtimeTheme = document.documentElement.dataset.theme ?? null;
  return isKlolTheme(runtimeTheme) ? runtimeTheme : "dark-modern";
}

function subscribeToThemeChanges(callback: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const listener = () => callback();
  window.addEventListener("storage", listener);
  window.addEventListener("klol-theme-change", listener);

  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener("klol-theme-change", listener);
  };
}

export default function ThemeSwitcher({
  compact = false,
}: {
  compact?: boolean;
}) {
  const activeTheme = useSyncExternalStore(
    subscribeToThemeChanges,
    readStoredTheme,
    (): KlolTheme => "dark-modern"
  );

  useEffect(() => {
    applyTheme(activeTheme);
  }, [activeTheme]);

  const activeIndex = useMemo(
    () => Math.max(0, themes.findIndex((theme) => theme.id === activeTheme)),
    [activeTheme]
  );

  const selectTheme = (theme: KlolTheme) => {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    applyTheme(theme);
    window.dispatchEvent(new Event("klol-theme-change"));
  };

  if (compact) {
    const active = themes[activeIndex] ?? themes[0];
    const next = themes[(activeIndex + 1) % themes.length] ?? themes[0];

    return (
      <button
        className="theme-switcher theme-switcher--compact"
        type="button"
        title={`테마 변경: 다음 ${next.description}`}
        aria-label={`현재 ${active.description}. 누르면 ${next.description}로 변경`}
        onClick={() => selectTheme(next.id)}
      >
        <Palette aria-hidden="true" size={15} />
        <span>{active.shortLabel}</span>
      </button>
    );
  }

  return (
    <div className="theme-switcher" aria-label="테마 선택">
      <Palette className="theme-switcher__icon" aria-hidden="true" size={15} />
      {themes.map((theme) => (
        <button
          key={theme.id}
          className="theme-switcher__option"
          type="button"
          aria-pressed={activeTheme === theme.id}
          title={theme.description}
          onClick={() => selectTheme(theme.id)}
        >
          {theme.label}
        </button>
      ))}
    </div>
  );
}
