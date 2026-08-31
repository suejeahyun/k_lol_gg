"use client";

import { Palette } from "lucide-react";
import { useEffect, useMemo, useSyncExternalStore } from "react";

export type KlolTheme = "bright-bloom" | "lavender-dream" | "mint-breeze";

const THEME_STORAGE_KEY = "klol-theme";

const themes: Array<{
  id: KlolTheme;
  label: string;
  shortLabel: string;
  description: string;
}> = [
  {
    id: "bright-bloom",
    label: "블룸",
    shortLabel: "블룸",
    description: "하늘빛 Bright Bloom 기본 테마",
  },
  {
    id: "lavender-dream",
    label: "라일락",
    shortLabel: "라일락",
    description: "포근한 라일락 드림 테마",
  },
  {
    id: "mint-breeze",
    label: "민트",
    shortLabel: "민트",
    description: "산뜻한 민트 브리즈 테마",
  },
];

function isKlolTheme(value: string | null): value is KlolTheme {
  return Boolean(value && themes.some((theme) => theme.id === value));
}

function applyTheme(theme: KlolTheme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = "light";
}

function readStoredTheme(): KlolTheme {
  if (typeof window === "undefined") {
    return "bright-bloom";
  }

  const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (isKlolTheme(savedTheme)) return savedTheme;

  const runtimeTheme = document.documentElement.dataset.theme ?? null;
  return isKlolTheme(runtimeTheme) ? runtimeTheme : "bright-bloom";
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
    (): KlolTheme => "bright-bloom"
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
    <div className="theme-switcher" role="group" aria-label="테마 선택">
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
