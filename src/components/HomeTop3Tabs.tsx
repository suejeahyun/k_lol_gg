"use client";

import {
  Children,
  KeyboardEvent,
  ReactNode,
  useId,
  useState,
} from "react";

type HomeTop3Tab = {
  id: string;
  eyebrow: string;
  label: string;
};

type HomeTop3TabsProps = {
  tabs: HomeTop3Tab[];
  children: ReactNode;
};

export default function HomeTop3Tabs({ tabs, children }: HomeTop3TabsProps) {
  const [activeId, setActiveId] = useState(tabs[0]?.id ?? "");
  const instanceId = useId().replace(/:/g, "");
  const panels = Children.toArray(children);

  const focusTab = (id: string) => {
    window.requestAnimationFrame(() => {
      document.getElementById(`home-top3-tab-${instanceId}-${id}`)?.focus();
    });
  };

  const handleKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (tabs.length < 2) return;

    let nextIndex = index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (index + 1) % tabs.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (index - 1 + tabs.length) % tabs.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = tabs.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    const nextId = tabs[nextIndex]?.id;
    if (!nextId) return;
    setActiveId(nextId);
    focusTab(nextId);
  };

  return (
    <div className="home-top3-mode-shell">
      <div className="home-top3-mode-tabs" role="tablist" aria-label="TOP3 기준 선택">
        {tabs.map((tab, index) => {
          const selected = tab.id === activeId;
          return (
            <button
              key={tab.id}
              id={`home-top3-tab-${instanceId}-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`home-top3-panel-${instanceId}-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              className="home-top3-mode-tab"
              onClick={() => setActiveId(tab.id)}
              onKeyDown={(event) => handleKeyDown(event, index)}
            >
              <span>{tab.eyebrow}</span>
              <strong>{tab.label}</strong>
            </button>
          );
        })}
      </div>

      <div className="home-top3-mode-panels">
        {tabs.map((tab, index) => (
          <div
            key={tab.id}
            id={`home-top3-panel-${instanceId}-${tab.id}`}
            role="tabpanel"
            aria-labelledby={`home-top3-tab-${instanceId}-${tab.id}`}
            className={`home-top3-mode-panel home-top3-mode-panel--${tab.id}`}
            hidden={tab.id !== activeId}
            tabIndex={0}
          >
            {panels[index] ?? null}
          </div>
        ))}
      </div>
    </div>
  );
}
